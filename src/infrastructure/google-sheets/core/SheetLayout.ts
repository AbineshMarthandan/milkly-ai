import { AppError } from '@/domain/errors/AppError';
import { quoteSheet } from '../client/a1';
import type { BatchReader } from '../client/BatchReader';
import type { Row, SheetsApiClient } from '../client/SheetsApiClient';
import { indexHeader, type HeaderIndex } from '../mappers/rowMapper';
import type { SheetSchema } from '../schemas/sheetSchemas';

export interface SheetHeader {
  index: HeaderIndex;
  width: number;
}

interface SpreadsheetMeta {
  sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
}

/** Caches each tab's header row and numeric sheet ID (needed for structural edits). */
export class SheetLayout {
  private readonly headers = new Map<string, SheetHeader>();
  private sheetIds: Map<string, number> | null = null;

  constructor(
    private readonly client: SheetsApiClient,
    private readonly reader: BatchReader,
  ) {}

  remember(sheet: string, headerRow: Row): SheetHeader {
    const header = { index: indexHeader(headerRow), width: headerRow.length };
    this.headers.set(sheet, header);
    return header;
  }

  async getHeader(schema: SheetSchema): Promise<SheetHeader> {
    const cached = this.headers.get(schema.name);
    if (cached) return cached;
    const rows = await this.reader.read(`${quoteSheet(schema.name)}!1:1`);
    if (!rows[0]?.length) {
      throw new AppError('SCHEMA_MISMATCH', { details: `Tab "${schema.name}" has no header row` });
    }
    return this.remember(schema.name, rows[0]);
  }

  /** Header for writing: every schema column must exist, or data would be silently dropped. */
  async getWritableHeader(schema: SheetSchema): Promise<SheetHeader> {
    const header = await this.getHeader(schema);
    const missing = schema.columns.filter((column) => !header.index.has(column.key)).map((column) => column.key);
    if (missing.length) {
      throw new AppError('SCHEMA_MISMATCH', {
        details: `Tab "${schema.name}" is missing columns: ${missing.join(', ')}. Run "Repair sheet structure".`,
      });
    }
    return header;
  }

  async getSheetId(sheet: string): Promise<number> {
    if (!this.sheetIds) {
      const meta = await this.client.getSpreadsheet<SpreadsheetMeta>('sheets.properties(sheetId,title)');
      this.sheetIds = new Map(
        (meta.sheets ?? []).flatMap((entry) =>
          entry.properties?.title !== undefined && entry.properties.sheetId !== undefined
            ? [[entry.properties.title, entry.properties.sheetId] as const]
            : [],
        ),
      );
    }
    const id = this.sheetIds.get(sheet);
    if (id === undefined) throw new AppError('SHEET_MISSING', { details: `Tab "${sheet}" does not exist` });
    return id;
  }

  invalidate() {
    this.headers.clear();
    this.sheetIds = null;
  }
}
