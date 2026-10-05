import type { Role } from './user';

/**
 * Shared building blocks for every persisted document.
 *
 * The shapes deliberately mirror MongoDB documents: a string `_id`, embedded
 * snapshots instead of joins, and ISO-8601 timestamps. Google Sheets is only the
 * current persistence mechanism; nothing here knows about rows or cells.
 */

/** Business identifier such as `MLVID000001`. Never a spreadsheet row number. */
export type EntityId = string;

/** UTC timestamp in ISO-8601 format, e.g. `2026-10-05T10:00:00.000Z`. */
export type IsoDateTime = string;

/** Calendar date in `YYYY-MM-DD` format (business-local, no time zone). */
export type IsoDate = string;

export interface AuditFields {
  createdAt: IsoDateTime;
  createdBy: EntityId;
  updatedAt: IsoDateTime;
  updatedBy: EntityId;
}

export interface BaseEntity extends AuditFields {
  _id: EntityId;
  /** Soft-delete flag. Master data is deactivated, never physically removed while referenced. */
  isActive: boolean;
  /** Optimistic-concurrency token, incremented on every write (like Mongoose `__v`). */
  version: number;
}

/** Audit fields and the version are owned by the persistence layer. */
export type SystemManagedField = keyof AuditFields | 'version';

/** What a caller supplies to create a document. */
export type EntityInput<T extends BaseEntity> = Omit<T, SystemManagedField>;

/** What a caller may change on an existing document. */
export type EntityChanges<T extends BaseEntity> = Partial<Omit<T, '_id' | SystemManagedField>>;

/** The user performing an operation; stamped into audit fields. */
export interface Actor {
  userId: EntityId;
  email: string;
  displayName: string;
  role: Role;
}

export const SYSTEM_ACTOR_ID = 'SYSTEM';
