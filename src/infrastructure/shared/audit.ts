import type { BaseEntity, EntityChanges, EntityInput } from '@/domain/models';
import { SYSTEM_ACTOR_ID } from '@/domain/models';

/** Supplies "who" and "when" for audit stamps; shared by every data source. */
export interface AuditContext {
  actorId(): string;
  now(): string;
}

export function createAuditContext(getActorId: () => string | null | undefined): AuditContext {
  return {
    actorId: () => getActorId() ?? SYSTEM_ACTOR_ID,
    now: () => new Date().toISOString(),
  };
}

/** Adds audit fields and the initial version to a new document. */
export function stampCreate<T extends BaseEntity>(input: EntityInput<T>, audit: AuditContext): T {
  const now = audit.now();
  const actor = audit.actorId();
  return { ...input, version: 1, createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor } as T;
}

/** Applies changes and bumps the version; creation fields and `_id` are immutable. */
export function stampUpdate<T extends BaseEntity>(current: T, changes: EntityChanges<T>, audit: AuditContext): T {
  const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
  return {
    ...current,
    ...defined,
    _id: current._id,
    createdAt: current.createdAt,
    createdBy: current.createdBy,
    version: (current.version || 0) + 1,
    updatedAt: audit.now(),
    updatedBy: audit.actorId(),
  };
}
