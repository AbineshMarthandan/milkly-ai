import { AppError } from '@/domain/errors/AppError';
import { coalesceRows, columnRange, parseRowRange, quoteSheet, rowRange } from '../client/a1';
import type { BatchReader } from '../client/BatchReader';
import type { CellValue, Row, SheetsApiClient } from '../client/SheetsApiClient';
import { deserializeCell, documentToRow, isBlankRow, rowToDocument } from '../mappers/rowMapper';
import type { SheetSchema } from '../schemas/sheetSchemas';
import type { SheetLayout } from './SheetLayout';

export interface SheetsContext {
  client: SheetsApiClient;
  reader: BatchReader;
  layout: SheetLayout;
}

export interface Located<T> {
  rowNumber: number;
  raw: Row;
  doc: T;
}

export interface RowRecord<T> {
  rowNumber: number;
  doc: T;
}

interface Snapshot<T> {
  docs: T[];
  rowById: Map<string, number>;
  loadedAt: number;
}

/** Physical row number of the header. Data starts on row 2. */
const HEADER_ROW = 1;

/**
 * A tab treated as a document collection.
 *
 * - Documents are addressed by `_id`; row numbers are a transient lookup
 *   detail and are re-resolved (fresh read of the `_id` column) before every
 *   write, so manual row inserts/deletes cannot redirect a write.
 * - The app never deletes rows (soft delete only), so writes are append or
 *   in-place updates.
 * - Whole-collection reads are cached for `ttlMs` and shared by concurrent callers.
 * - Writes update the cache in place, so a save never forces a re-download.
 */
export class SheetCollection<T extends { _id: string }> {
  private snapshot: Snapshot<T> | null = null;
  private inflight: Promise<Snapshot<T>> | null = null;
  private readonly projections = new Map<string, { at: number; value: Promise<Array<{ rowNumber: number; values: Record<string, unknown> }>> }>();

  constructor(
    private readonly ctx: SheetsContext,
    readonly schema: SheetSchema,
    private readonly ttlMs = 20_000,
  ) {}

  get name() {
    return this.schema.name;
  }

  // ---------------------------------------------------------------- reads

  async findAll(options: { fresh?: boolean } = {}): Promise<T[]> {
    return (await this.load(options.fresh)).docs;
  }

  async findById(id: string): Promise<T | null> {
    const snapshot = await this.load();
    return snapshot.docs.find((doc) => doc._id === id) ?? null;
  }

  /** Fresh lookup of one document and its current row. */
  async locate(id: string): Promise<Located<T> | null> {
    const ids = await this.readIdColumn();
    const index = ids.indexOf(id);
    if (index === -1) return null;
    const rowNumber = index + HEADER_ROW + 1;
    const located = await this.readRow(rowNumber);
    if (!located || located.doc._id !== id) {
      throw new AppError('CONCURRENT_UPDATE', { details: `Row ${rowNumber} of ${this.name} moved during lookup` });
    }
    return located;
  }

  async readRow(rowNumber: number): Promise<Located<T> | null> {
    const header = await this.ctx.layout.getHeader(this.schema);
    const [row] = await this.ctx.reader.read(rowRange(this.name, rowNumber, rowNumber, header.width));
    if (isBlankRow(row)) return null;
    return { rowNumber, raw: row, doc: rowToDocument<T>(row, header.index, this.schema) };
  }

  /** Reads only the given columns — far cheaper than a full read on large collections. */
  async readColumns(keys: readonly string[], options: { maxAgeMs?: number } = {}) {
    const cacheKey = keys.join('|');
    const cached = this.projections.get(cacheKey);
    if (cached && Date.now() - cached.at < (options.maxAgeMs ?? this.ttlMs)) return cached.value;
    const value = this.fetchColumns(keys);
    this.projections.set(cacheKey, { at: Date.now(), value });
    value.catch(() => this.projections.delete(cacheKey));
    return value;
  }

  /** Reads specific rows, coalesced into as few ranges as possible. */
  async readRows(rowNumbers: readonly number[]): Promise<RowRecord<T>[]> {
    if (!rowNumbers.length) return [];
    const header = await this.ctx.layout.getHeader(this.schema);
    const wanted = new Set(rowNumbers);
    const blocks = coalesceRows(rowNumbers);
    const results = await Promise.all(
      blocks.map((block) => this.ctx.reader.read(rowRange(this.name, block.start, block.end, header.width))),
    );
    const records: RowRecord<T>[] = [];
    blocks.forEach((block, blockIndex) => {
      results[blockIndex].forEach((row, offset) => {
        const rowNumber = block.start + offset;
        if (wanted.has(rowNumber) && !isBlankRow(row)) {
          records.push({ rowNumber, doc: rowToDocument<T>(row, header.index, this.schema) });
        }
      });
    });
    return records;
  }

  // ---------------------------------------------------------------- writes

  /** Appends one document; rejects duplicate `_id`s (fresh check). */
  async insert(doc: T): Promise<{ doc: T; range: string }> {
    const ids = await this.readIdColumn();
    if (ids.includes(doc._id)) {
      throw new AppError('DUPLICATE', { details: `${this.name} already contains ${doc._id}` });
    }
    const range = await this.insertMany([doc]);
    return { doc, range };
  }

  /** Appends documents in one call (one contiguous block); returns the A1 range written. */
  async insertMany(docs: readonly T[]): Promise<string> {
    if (!docs.length) throw new AppError('WRITE_FAILED', { details: 'insertMany called with no documents' });
    const header = await this.ctx.layout.getWritableHeader(this.schema);
    const rows = docs.map((doc) => documentToRow(doc, header.index, this.schema, header.width));
    const range = await this.ctx.client.append(`${quoteSheet(this.name)}!A1`, rows);
    const parsed = parseRowRange(range);
    if (this.snapshot && parsed) {
      docs.forEach((doc, offset) => {
        this.snapshot!.docs.push(doc);
        this.snapshot!.rowById.set(doc._id, parsed.startRow + offset);
      });
    } else {
      this.snapshot = null;
    }
    this.projections.clear();
    return range;
  }

  /**
   * Read-modify-write of one document with optimistic concurrency.
   * `mutate` receives the freshly read document.
   */
  async replace(id: string, mutate: (current: T) => T, options: { expectedVersion?: number } = {}): Promise<T> {
    const located = await this.locate(id);
    if (!located) throw new AppError('NOT_FOUND', { details: `${this.name}/${id}` });
    const currentVersion = Number((located.doc as { version?: number }).version ?? 0);
    if (options.expectedVersion !== undefined && currentVersion !== options.expectedVersion) {
      throw new AppError('CONCURRENT_UPDATE', {
        details: `${this.name}/${id}: expected version ${options.expectedVersion}, found ${currentVersion}`,
      });
    }
    const next = mutate(located.doc);
    await this.writeAt(located, next);
    return next;
  }

  /** Overwrites the row at a located position (caller has done any checks). */
  async writeAt(located: Located<T>, doc: T): Promise<void> {
    const header = await this.ctx.layout.getWritableHeader(this.schema);
    const row = documentToRow(doc, header.index, this.schema, header.width, located.raw);
    await this.ctx.client.updateValues(rowRange(this.name, located.rowNumber, located.rowNumber, header.width), [row]);
    if (this.snapshot) {
      const index = this.snapshot.docs.findIndex((existing) => existing._id === doc._id);
      if (index >= 0) this.snapshot.docs[index] = doc;
      else this.snapshot.docs.push(doc);
      this.snapshot.rowById.set(doc._id, located.rowNumber);
    }
    this.projections.clear();
  }

  invalidate() {
    this.snapshot = null;
    this.inflight = null;
    this.projections.clear();
  }

  // ---------------------------------------------------------------- internals

  private async load(fresh = false): Promise<Snapshot<T>> {
    if (!fresh && this.snapshot && Date.now() - this.snapshot.loadedAt < this.ttlMs) return this.snapshot;
    if (!fresh && this.inflight) return this.inflight;
    const promise = this.fetchAll();
    this.inflight = promise;
    try {
      const snapshot = await promise;
      this.snapshot = snapshot;
      return snapshot;
    } finally {
      if (this.inflight === promise) this.inflight = null;
    }
  }

  private async fetchAll(): Promise<Snapshot<T>> {
    const rows = await this.ctx.reader.read(quoteSheet(this.name));
    if (!rows[0]?.length) throw new AppError('SCHEMA_MISMATCH', { details: `Tab "${this.name}" has no header row` });
    const header = this.ctx.layout.remember(this.name, rows[0]);
    const docs: T[] = [];
    const rowById = new Map<string, number>();
    for (let i = 1; i < rows.length; i += 1) {
      if (isBlankRow(rows[i])) continue;
      const doc = rowToDocument<T>(rows[i], header.index, this.schema);
      if (!doc._id || rowById.has(doc._id)) continue;
      docs.push(doc);
      rowById.set(doc._id, i + 1);
    }
    return { docs, rowById, loadedAt: Date.now() };
  }

  private async readIdColumn(): Promise<string[]> {
    const header = await this.ctx.layout.getHeader(this.schema);
    const position = header.index.get('_id');
    if (position === undefined) throw new AppError('SCHEMA_MISMATCH', { details: `Tab "${this.name}" has no _id column` });
    const rows = await this.ctx.reader.read(columnRange(this.name, position));
    return rows.map((row) => String(row[0] ?? '').trim());
  }

  private async fetchColumns(keys: readonly string[]) {
    const header = await this.ctx.layout.getHeader(this.schema);
    const columns = keys.map((key) => {
      const column = this.schema.columns.find((candidate) => candidate.key === key);
      const position = header.index.get(key);
      if (!column || position === undefined) {
        throw new AppError('SCHEMA_MISMATCH', { details: `Tab "${this.name}" has no "${key}" column` });
      }
      return { column, position };
    });
    const results = await Promise.all(columns.map(({ position }) => this.ctx.reader.read(columnRange(this.name, position))));
    const length = Math.max(0, ...results.map((rows) => rows.length));
    const records: Array<{ rowNumber: number; values: Record<string, unknown> }> = [];
    for (let i = 0; i < length; i += 1) {
      const values: Record<string, unknown> = {};
      let blank = true;
      columns.forEach(({ column }, index) => {
        const cell = results[index][i]?.[0] as CellValue | undefined;
        if (cell !== undefined && cell !== null && cell !== '') blank = false;
        values[column.key] = deserializeCell(cell, column);
      });
      if (!blank) records.push({ rowNumber: i + HEADER_ROW + 1, values });
    }
    return records;
  }
}
