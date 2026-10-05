import type { SequenceEntity } from '../models/sequence';

export interface IdFormat {
  prefix: string;
  padding: number;
}

/** Human-readable, sequential business IDs. Numbers are never reused. */
export const ID_FORMATS: Record<SequenceEntity, IdFormat> = {
  vendor: { prefix: 'MLVID', padding: 6 },
  category: { prefix: 'MLCAT', padding: 6 },
  product: { prefix: 'MLPID', padding: 6 },
  route: { prefix: 'MLRID', padding: 6 },
  customer: { prefix: 'MLCID', padding: 6 },
  bill: { prefix: 'MLBID', padding: 6 },
  user: { prefix: 'MLUID', padding: 6 },
};

/** Printed bill number; shares the `bill` counter with the bill `_id`. */
export const BILL_NUMBER_FORMAT: IdFormat = { prefix: 'MLB', padding: 6 };

export function formatSequenceId(format: IdFormat, value: number): string {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`Invalid sequence number: ${value}`);
  return `${format.prefix}${String(value).padStart(format.padding, '0')}`;
}

export function parseSequenceNumber(id: string, format: IdFormat): number | null {
  if (!id.startsWith(format.prefix)) return null;
  const digits = id.slice(format.prefix.length);
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

/** Highest sequence number already in use, or 0. */
export function maxSequenceNumber(ids: Iterable<string>, format: IdFormat): number {
  let max = 0;
  for (const id of ids) {
    const value = parseSequenceNumber(id, format);
    if (value !== null && value > max) max = value;
  }
  return max;
}

/** Random token for revisions and claims (not security-sensitive). */
export function randomToken(length = 12): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}
