import { AppError } from '@/domain/errors/AppError';
import type { BaseEntity, Bill, BillHeader, BillLine, EntityChanges, EntityId, EntityInput } from '@/domain/models';
import type { BillListQuery, BillRepository, UpdateOptions } from '@/domain/repositories';
import { flattenBill, groupBillLines } from '@/domain/services/billing/billDocument';
import { stampCreate, stampUpdate, type AuditContext } from '../../shared/audit';
import { parseRowRange } from '../client/a1';
import type { SheetCollection } from '../core/SheetCollection';

/** Header row as stored: the domain header plus a storage-only pointer to its lines. */
export type BillHeaderRow = BillHeader & { _itemsRange: string };
/** Line row as stored in `bill_items`. */
export type BillLineRow = BillLine & BaseEntity;

const HEADER_ONLY_FIELDS = new Set(['vendors']);

function toHeader(row: BillHeaderRow): BillHeader {
  const { _itemsRange: _ignored, ...header } = row;
  return header;
}

function matchesQuery(header: Pick<BillHeader, 'billDate' | 'status'>, query: BillListQuery): boolean {
  if (query.dateFrom && header.billDate < query.dateFrom) return false;
  if (query.dateTo && header.billDate > query.dateTo) return false;
  if (query.statuses?.length && !query.statuses.includes(header.status)) return false;
  return true;
}

const newestFirst = (a: BillHeader, b: BillHeader) =>
  b.billDate.localeCompare(a.billDate) || b.billNumber.localeCompare(a.billNumber);

/**
 * Bills on Google Sheets.
 *
 * Layout: `bills` holds one header row per bill; `bill_items` holds one row
 * per line. The embedded Mongo-style document is reassembled on read.
 *
 * Read optimisations (bills grow without bound, master data does not):
 * - `list` reads only the `_id` + `billDate` columns, then fetches just the
 *   header rows inside the requested date range.
 * - Each header stores `_itemsRange`, the exact block of `bill_items` rows its
 *   lines were appended to, so opening a bill is one small read. If the hint
 *   is stale (rows edited by hand) it falls back to scanning `billId`.
 *
 * Write ordering: lines are appended first and the header last. A failure in
 * between leaves only orphaned lines that no header points to (harmless and
 * invisible), never a bill without lines. Edits append a new line revision and
 * switch the header's `itemsRevision`, so writes are append-only.
 */
export class GoogleSheetsBillRepository implements BillRepository {
  constructor(
    private readonly headers: SheetCollection<BillHeaderRow>,
    private readonly lines: SheetCollection<BillLineRow>,
    private readonly audit: AuditContext,
  ) {}

  async list(query: BillListQuery = {}): Promise<BillHeader[]> {
    return (await this.listRows(query)).map(toHeader);
  }

  async count(): Promise<number> {
    const index = await this.headers.readColumns(['_id']);
    return index.filter(({ values }) => values._id).length;
  }

  async getById(id: EntityId): Promise<Bill | null> {
    const located = await this.headers.locate(id);
    if (!located) return null;
    const [lines] = await this.fetchLines([located.doc]);
    return { ...toHeader(located.doc), vendors: groupBillLines(lines ?? []) };
  }

  async create(input: EntityInput<Bill>): Promise<Bill> {
    const ids = await this.headers.readColumns(['_id'], { maxAgeMs: 0 });
    if (ids.some(({ values }) => values._id === input._id)) {
      throw new AppError('DUPLICATE', { details: `Bill ${input._id} already exists` });
    }
    const bill = stampCreate<Bill>(input, this.audit);
    const itemsRange = await this.appendLines(bill);
    const { vendors: _vendors, ...header } = bill;
    await this.headers.insertMany([{ ...header, _itemsRange: itemsRange }]);
    return bill;
  }

  async update(id: EntityId, changes: EntityChanges<Bill>, options: UpdateOptions = {}): Promise<Bill> {
    const located = await this.headers.locate(id);
    if (!located) throw new AppError('NOT_FOUND', { userMessage: 'Bill not found.' });
    if (options.expectedVersion !== undefined && located.doc.version !== options.expectedVersion) {
      throw new AppError('CONCURRENT_UPDATE', {
        userMessage: 'This bill was changed by someone else. Reload it and try again.',
        details: `bills/${id}: expected v${options.expectedVersion}, found v${located.doc.version}`,
      });
    }

    const headerChanges = Object.fromEntries(
      Object.entries(changes).filter(([key]) => !HEADER_ONLY_FIELDS.has(key)),
    ) as EntityChanges<BillHeaderRow>;

    let vendors = changes.vendors;
    if (vendors) {
      if (!changes.itemsRevision || changes.itemsRevision === located.doc.itemsRevision) {
        throw new AppError('WRITE_FAILED', { details: 'Changing bill lines requires a new itemsRevision' });
      }
      const draft = { ...located.doc, ...headerChanges, vendors } as Bill;
      headerChanges._itemsRange = await this.appendLines(draft);
    }

    const next = stampUpdate(located.doc, headerChanges, this.audit);
    await this.headers.writeAt(located, next);

    if (!vendors) [vendors] = (await this.fetchLines([next])).map((lines) => groupBillLines(lines));
    return { ...toHeader(next), vendors: vendors ?? [] };
  }

  async listLines(query: BillListQuery): Promise<BillLine[]> {
    const rows = await this.listRows(query);
    return rows.length ? (await this.fetchLines(rows)).flat() : [];
  }

  /** Header rows (with storage hints) matching the query, newest first. */
  private async listRows(query: BillListQuery): Promise<BillHeaderRow[]> {
    if (!query.dateFrom && !query.dateTo) {
      const all = await this.headers.findAll();
      return all.filter((row) => matchesQuery(row, query)).sort(newestFirst);
    }
    const index = await this.headers.readColumns(['_id', 'billDate']);
    const rowNumbers = index
      .filter(({ values }) => {
        const date = String(values.billDate ?? '');
        return values._id && (!query.dateFrom || date >= query.dateFrom) && (!query.dateTo || date <= query.dateTo);
      })
      .map(({ rowNumber }) => rowNumber);
    const records = await this.headers.readRows(rowNumbers);
    return records
      .map(({ doc }) => doc)
      .filter((row) => row._id && matchesQuery(row, query))
      .sort(newestFirst);
  }

  /** Appends a bill's current lines as one contiguous block; returns its A1 range. */
  private async appendLines(bill: Bill): Promise<string> {
    const lines = flattenBill(bill).map((line) =>
      stampCreate<BillLineRow>(
        { ...line, _id: `${bill._id}-${bill.itemsRevision}-${String(line.lineNo).padStart(3, '0')}`, isActive: true },
        this.audit,
      ),
    );
    return this.lines.insertMany(lines);
  }

  /** Current-revision lines for each header, using the stored range hint when possible. */
  private async fetchLines(headers: readonly BillHeaderRow[]): Promise<BillLine[][]> {
    const hinted = new Map<EntityId, number[]>();
    for (const header of headers) {
      const range = header._itemsRange ? parseRowRange(header._itemsRange) : null;
      if (range && range.endRow - range.startRow < 2000) {
        hinted.set(header._id, Array.from({ length: range.endRow - range.startRow + 1 }, (_, i) => range.startRow + i));
      }
    }
    const hintedRecords = await this.lines.readRows([...hinted.values()].flat());
    const byBill = new Map<EntityId, BillLine[]>();
    for (const { doc } of hintedRecords) {
      const list = byBill.get(doc.billId) ?? [];
      list.push(doc);
      byBill.set(doc.billId, list);
    }

    const current = (header: BillHeaderRow, candidates: readonly BillLine[]) =>
      candidates.filter((line) => line.billId === header._id && line.itemsRevision === header.itemsRevision);

    const result = headers.map((header) => current(header, byBill.get(header._id) ?? []));
    const stale = headers.filter((header, index) => result[index].length !== header.itemCount);
    if (stale.length) {
      // Fallback: locate rows by scanning only the billId column.
      const staleIds = new Set(stale.map((header) => header._id));
      const column = await this.lines.readColumns(['billId']);
      const rows = column.filter(({ values }) => staleIds.has(String(values.billId))).map(({ rowNumber }) => rowNumber);
      const records = await this.lines.readRows(rows);
      headers.forEach((header, index) => {
        if (staleIds.has(header._id)) {
          result[index] = current(
            header,
            records.map(({ doc }) => doc),
          );
        }
      });
    }
    return result;
  }
}
