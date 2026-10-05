import { AppError } from '@/domain/errors/AppError';
import type { Sequence, SequenceEntity } from '@/domain/models';
import type { SequenceRepository } from '@/domain/repositories';
import { ID_FORMATS, randomToken } from '@/domain/services/ids';
import { backoffDelay, sleep } from '../../shared/async';
import { stampCreate, stampUpdate, type AuditContext } from '../../shared/audit';
import type { SheetCollection } from '../core/SheetCollection';

type SequenceRow = Sequence & { claimToken: string };

const MAX_ATTEMPTS = 6;
/** Time allowed for a competing writer's update to land before we verify ours. */
const VERIFY_DELAY_MS = 350;

/**
 * Counter allocation on a non-transactional store ("claim, wait, verify").
 *
 * 1. Fresh-read the counter row.
 * 2. Write `lastNumber + 1` together with a random claim token.
 * 3. Wait briefly, re-read, and keep the number only if our token survived;
 *    otherwise retry with backoff.
 *
 * This makes collisions between devices very unlikely but cannot rule them out
 * (Google Sheets has no compare-and-set). The second line of defence is the
 * duplicate-`_id` check performed on insert; the bill service re-allocates on
 * a duplicate. For strict guarantees, implement this interface with MongoDB
 * `findOneAndUpdate({$inc})` or an Apps Script `LockService` endpoint.
 */
export class GoogleSheetsSequenceRepository implements SequenceRepository {
  constructor(
    private readonly collection: SheetCollection<SequenceRow>,
    private readonly audit: AuditContext,
  ) {}

  async next(entity: SequenceEntity, floor = 0): Promise<number> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const located = await this.collection.locate(entity);
      if (!located) {
        await this.createCounter(entity);
        continue;
      }
      const value = Math.max(Number(located.doc.lastNumber) || 0, floor) + 1;
      const claimToken = randomToken(16);
      await this.collection.writeAt(
        located,
        stampUpdate(located.doc, { lastNumber: value, claimToken }, this.audit),
      );
      await sleep(VERIFY_DELAY_MS + Math.random() * 250);
      const check = await this.collection.readRow(located.rowNumber);
      if (check?.doc._id === entity && check.doc.claimToken === claimToken && Number(check.doc.lastNumber) === value) {
        return value;
      }
      await sleep(backoffDelay(attempt, 250));
    }
    throw new AppError('CONCURRENT_UPDATE', {
      userMessage: 'Several people are saving at the same moment. Please try again.',
      details: `Could not claim a ${entity} number after ${MAX_ATTEMPTS} attempts`,
    });
  }

  private async createCounter(entity: SequenceEntity) {
    const format = ID_FORMATS[entity];
    try {
      await this.collection.insert(
        stampCreate<SequenceRow>(
          { _id: entity, prefix: format.prefix, padding: format.padding, lastNumber: 0, claimToken: '', isActive: true },
          this.audit,
        ),
      );
    } catch (error) {
      // Another device created it first — fine, the next loop iteration uses theirs.
      if (!(error instanceof AppError && error.code === 'DUPLICATE')) throw error;
    }
  }
}
