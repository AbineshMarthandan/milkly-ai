import { AppError } from '@/domain/errors/AppError';
import type { Sequence, SequenceEntity } from '@/domain/models';
import type { SequenceRepository } from '@/domain/repositories';
import { ID_FORMATS, randomToken } from '@/domain/services/ids';
import { sleep } from '../../shared/async';
import { stampCreate, stampUpdate, type AuditContext } from '../../shared/audit';
import type { SheetCollection } from '../core/SheetCollection';

type SequenceRow = Sequence & { claimToken: string };

const MAX_ATTEMPTS = 10;
/** Time allowed for a competing writer's update to land before we verify ours. */
const VERIFY_DELAY_MS = 350;
const BACKOFF_BASE_MS = 300;
const BACKOFF_CAP_MS = 4000;

/**
 * Counter allocation on a non-transactional store ("claim, wait, verify").
 *
 * 1. Fresh-read the counter row.
 * 2. Write `lastNumber + 1` together with a random claim token.
 * 3. Wait briefly, re-read, and keep the number only if our token survived.
 *    Otherwise back off for a random, growing time (so competing devices fall
 *    out of step) and retry from a fresh read.
 *
 * Google Sheets has no compare-and-set, so on a very slow network two devices
 * can still both "win" the same number. That case is caught after the bill is
 * written (see `GoogleSheetsBillRepository.ensureUniqueNumber`). A MongoDB
 * implementation would use `findOneAndUpdate({$inc})` instead.
 */
export class GoogleSheetsSequenceRepository implements SequenceRepository {
  /** Counter rows never move (rows are never deleted), so remember where each one is. */
  private readonly rows = new Map<SequenceEntity, number>();

  constructor(
    private readonly collection: SheetCollection<SequenceRow>,
    private readonly audit: AuditContext,
  ) {}

  async next(entity: SequenceEntity, floor = 0): Promise<number> {
    let located = await this.readCounter(entity);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      if (!located) {
        await this.createCounter(entity);
        located = await this.readCounter(entity);
        continue;
      }
      const value = Math.max(Number(located.doc.lastNumber) || 0, floor) + 1;
      const claimToken = randomToken(16);
      await this.collection.writeAt(located, stampUpdate(located.doc, { lastNumber: value, claimToken }, this.audit));
      await sleep(VERIFY_DELAY_MS + Math.random() * 250);
      const check = await this.collection.readRow(located.rowNumber);
      if (check?.doc._id === entity && check.doc.claimToken === claimToken && Number(check.doc.lastNumber) === value) {
        return value;
      }
      // Lost to another device. Back off with "full jitter" (a random wait up to
      // a growing cap) so contending devices spread out instead of colliding
      // again in lockstep. Then never reuse `check` as the base: it is stale
      // after the pause, and writing from a stale value can move the counter back.
      await sleep(Math.random() * Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt));
      located = await this.readCounter(entity);
    }
    throw new AppError('CONCURRENT_UPDATE', {
      userMessage: 'Several people are saving at the same moment. Please try again.',
      details: `Could not claim a ${entity} number after ${MAX_ATTEMPTS} attempts`,
    });
  }

  /** Fresh read of the counter: one request when its row is known, a lookup otherwise. */
  private async readCounter(entity: SequenceEntity) {
    const known = this.rows.get(entity);
    if (known !== undefined) {
      const row = await this.collection.readRow(known);
      if (row?.doc._id === entity) return row;
      this.rows.delete(entity); // edited by hand — fall back to a lookup
    }
    const located = await this.collection.locate(entity);
    if (located) this.rows.set(entity, located.rowNumber);
    return located;
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
