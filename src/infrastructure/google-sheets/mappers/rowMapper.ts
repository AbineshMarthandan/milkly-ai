import type { CellValue, Row } from '../client/SheetsApiClient';
import type { ColumnDef, ColumnType, SheetSchema } from '../schemas/sheetSchemas';

/** Google Sheets serial dates count days from 1899-12-30. */
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

function serialToDate(serial: number): Date {
  return new Date(SHEETS_EPOCH_MS + serial * DAY_MS);
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

const TYPE_DEFAULTS: Record<ColumnType, unknown> = {
  string: '',
  number: 0,
  boolean: false,
  json: null,
  datetime: null,
  date: '',
};

/** Converts a raw cell into the typed document value. Tolerates hand-edited cells. */
export function deserializeCell(value: CellValue | undefined, column: ColumnDef): unknown {
  if (isEmpty(value)) return structuredClone(column.defaultValue ?? TYPE_DEFAULTS[column.type]);
  switch (column.type) {
    case 'string':
      return String(value);
    case 'number': {
      const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
      return Number.isFinite(number) ? number : 0;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return /^(true|yes|1|y)$/i.test(String(value).trim());
    case 'json':
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value);
      } catch {
        return structuredClone(column.defaultValue ?? null);
      }
    case 'datetime':
      return typeof value === 'number' ? serialToDate(value).toISOString() : String(value);
    case 'date':
      if (typeof value === 'number') return serialToDate(value).toISOString().slice(0, 10);
      return String(value).slice(0, 10);
  }
}

/** Converts a document value into a cell. Written with valueInputOption=RAW. */
export function serializeCell(value: unknown, column: ColumnDef): CellValue {
  if (value === undefined || value === null) return column.type === 'json' ? JSON.stringify(column.defaultValue ?? null) : '';
  switch (column.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : '';
    case 'boolean':
      return Boolean(value);
    case 'json':
      return JSON.stringify(value);
    default:
      return String(value);
  }
}

export type HeaderIndex = ReadonlyMap<string, number>;

export function indexHeader(header: readonly CellValue[]): Map<string, number> {
  const index = new Map<string, number>();
  header.forEach((cell, position) => {
    const key = String(cell ?? '').trim();
    if (key && !index.has(key)) index.set(key, position);
  });
  return index;
}

/** Row → document, matching columns by header name. */
export function rowToDocument<T>(row: Row, header: HeaderIndex, schema: SheetSchema): T {
  const document: Record<string, unknown> = {};
  for (const column of schema.columns) {
    const position = header.get(column.key);
    document[column.key] = deserializeCell(position === undefined ? undefined : row[position], column);
  }
  return document as T;
}

/**
 * Document → row in the sheet's actual column order. Cells in columns the
 * schema does not know about (added by hand) are preserved from `baseRow`.
 */
export function documentToRow(document: object, header: HeaderIndex, schema: SheetSchema, width: number, baseRow: Row = []): Row {
  const row: Row = Array.from({ length: width }, (_, i) => baseRow[i] ?? '');
  const values = document as Record<string, unknown>;
  for (const column of schema.columns) {
    const position = header.get(column.key);
    if (position !== undefined) row[position] = serializeCell(values[column.key], column);
  }
  return row;
}

export function isBlankRow(row: Row | undefined): boolean {
  return !row || row.every((cell) => isEmpty(cell));
}
