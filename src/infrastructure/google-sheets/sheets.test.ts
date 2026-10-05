import { describe, expect, it } from 'vitest';
import { coalesceRows, columnLetter, parseRowRange, rowRange } from './client/a1';
import { documentToRow, indexHeader, rowToDocument } from './mappers/rowMapper';
import { SHEET_SCHEMAS, columnKeys } from './schemas/sheetSchemas';

describe('A1 helpers', () => {
  it('converts column indexes to letters', () => {
    expect([0, 25, 26, 51, 701, 702].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA']);
  });

  it('builds and parses row ranges', () => {
    expect(rowRange("bill's", 2, 5, 28)).toBe("'bill''s'!A2:AB5");
    expect(parseRowRange("'bill_items'!A120:AC134")).toEqual({ sheet: 'bill_items', startRow: 120, endRow: 134 });
    expect(parseRowRange('bills!A7:AF7')).toEqual({ sheet: 'bills', startRow: 7, endRow: 7 });
    expect(parseRowRange('garbage')).toBeNull();
  });

  it('coalesces scattered rows into few blocks', () => {
    expect(coalesceRows([10, 2, 3, 4, 300, 11], 25)).toEqual([
      { start: 2, end: 11 },
      { start: 300, end: 300 },
    ]);
  });
});

describe('row mapper', () => {
  const schema = SHEET_SCHEMAS.customers;

  it('round-trips a document regardless of column order', () => {
    const keys = columnKeys(schema);
    const shuffled = [...keys].reverse();
    const header = indexHeader(shuffled);
    const customer = {
      _id: 'MLCID000001', customerId: 'MLCID000001', routeId: 'MLRID000001', storeName: '=HYPERLINK("x")',
      contactPerson: '', phone: '0098400', address: 'Main Rd', priority: 2, vendorIds: ['MLVID000001'],
      isActive: true, version: 3, createdAt: '2026-10-05T10:00:00.000Z', createdBy: 'MLUID000001',
      updatedAt: '2026-10-05T10:00:00.000Z', updatedBy: 'MLUID000001',
    };
    const row = documentToRow(customer, header, schema, shuffled.length);
    expect(row[shuffled.indexOf('vendorIds')]).toBe('["MLVID000001"]');
    // Leading zeros and formula-like text are kept as plain strings (RAW input).
    expect(row[shuffled.indexOf('phone')]).toBe('0098400');
    expect(rowToDocument(row, header, schema)).toEqual(customer);
  });

  it('tolerates hand-edited cells and missing columns', () => {
    const header = indexHeader(['_id', 'storeName', 'priority', 'isActive']);
    const doc = rowToDocument<Record<string, unknown>>(['MLCID000009', 'Shop', '7', 'TRUE'], header, schema);
    expect(doc).toMatchObject({ _id: 'MLCID000009', priority: 7, isActive: true, vendorIds: [], version: 0 });
  });

  it('defaults isActive to true for blank cells and preserves unknown columns', () => {
    const header = indexHeader(['_id', 'isActive', 'myNotes']);
    expect(rowToDocument<{ isActive: boolean }>(['X', ''], header, schema).isActive).toBe(true);
    const row = documentToRow({ _id: 'X', isActive: false }, header, schema, 3, ['X', true, 'keep me']);
    expect(row).toEqual(['X', false, 'keep me']);
  });

  it('converts Sheets serial dates', () => {
    const header = indexHeader(['_id', 'billDate']);
    const doc = rowToDocument<{ billDate: string }>(['B', 46300], header, SHEET_SCHEMAS.bills);
    expect(doc.billDate).toBe('2026-10-05');
  });
});
