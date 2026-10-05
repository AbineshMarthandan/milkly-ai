import { AppError } from '@/domain/errors/AppError';
import type { Row, SheetsApiClient } from './SheetsApiClient';

interface Pending {
  range: string;
  resolve: (rows: Row[]) => void;
  reject: (error: unknown) => void;
}

/** Keeps URLs comfortably below Google's request-size limit. */
const MAX_RANGES_PER_REQUEST = 40;

/**
 * Coalesces reads issued in the same tick into one `values:batchGet` call.
 *
 * Opening the billing screen asks for vendors, categories, products, routes
 * and customers at once; without batching that is five API calls (and five
 * units of the per-minute quota) — with it, one.
 */
export class BatchReader {
  private queue: Pending[] = [];
  private scheduled = false;

  constructor(private readonly client: SheetsApiClient) {}

  read(range: string): Promise<Row[]> {
    return new Promise<Row[]>((resolve, reject) => {
      this.queue.push({ range, resolve, reject });
      if (!this.scheduled) {
        this.scheduled = true;
        setTimeout(() => void this.flush(), 0);
      }
    });
  }

  private async flush() {
    const batch = this.queue;
    this.queue = [];
    this.scheduled = false;
    const unique = [...new Set(batch.map((entry) => entry.range))];
    for (let i = 0; i < unique.length; i += MAX_RANGES_PER_REQUEST) {
      const ranges = unique.slice(i, i + MAX_RANGES_PER_REQUEST);
      const waiting = batch.filter((entry) => ranges.includes(entry.range));
      try {
        const results = await this.client.batchGet(ranges);
        ranges.forEach((range, index) => {
          const rows = results[index]?.values ?? [];
          for (const entry of waiting) if (entry.range === range) entry.resolve(rows);
        });
      } catch (error) {
        // One missing tab fails the whole batch; retry individually so only
        // the reads that are actually broken fail.
        if (error instanceof AppError && error.code === 'SHEET_MISSING' && ranges.length > 1) {
          await Promise.all(
            ranges.map(async (range) => {
              const entries = waiting.filter((entry) => entry.range === range);
              try {
                const [result] = await this.client.batchGet([range]);
                for (const entry of entries) entry.resolve(result?.values ?? []);
              } catch (inner) {
                for (const entry of entries) entry.reject(inner);
              }
            }),
          );
        } else {
          for (const entry of waiting) entry.reject(error);
        }
      }
    }
  }
}
