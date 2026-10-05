/** A1-notation helpers. Row numbers here are physical sheet rows, never entity IDs. */

/** 0 → A, 25 → Z, 26 → AA … */
export function columnLetter(index: number): string {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

export function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

export function rowRange(sheet: string, startRow: number, endRow: number, columnCount: number): string {
  return `${quoteSheet(sheet)}!A${startRow}:${columnLetter(Math.max(columnCount, 1) - 1)}${endRow}`;
}

export function columnRange(sheet: string, columnIndex: number, fromRow = 2): string {
  const letter = columnLetter(columnIndex);
  return `${quoteSheet(sheet)}!${letter}${fromRow}:${letter}`;
}

export interface ParsedRange {
  sheet: string;
  startRow: number;
  endRow: number;
}

/** Parses `'bill_items'!A120:AC134` (as returned by the append API). */
export function parseRowRange(range: string): ParsedRange | null {
  const match = range.match(/^(?:'((?:[^']|'')+)'|([^!]+))!\$?[A-Z]+\$?(\d+)(?::\$?[A-Z]+\$?(\d+))?$/);
  if (!match) return null;
  const sheet = (match[1] ?? match[2]).replace(/''/g, "'");
  const startRow = Number(match[3]);
  const endRow = match[4] ? Number(match[4]) : startRow;
  return { sheet, startRow, endRow };
}

/**
 * Groups sorted row numbers into contiguous blocks, bridging small gaps so a
 * scattered selection costs a handful of ranges instead of one per row.
 */
export function coalesceRows(rows: readonly number[], maxGap = 25): Array<{ start: number; end: number }> {
  const sorted = [...new Set(rows)].sort((a, b) => a - b);
  const blocks: Array<{ start: number; end: number }> = [];
  for (const row of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && row - last.end <= maxGap) last.end = row;
    else blocks.push({ start: row, end: row });
  }
  return blocks;
}
