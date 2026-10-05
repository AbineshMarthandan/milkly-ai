import type { BaseEntity } from './common';

export const SEQUENCE_ENTITIES = ['vendor', 'category', 'product', 'route', 'customer', 'bill', 'user'] as const;
export type SequenceEntity = (typeof SEQUENCE_ENTITIES)[number];

/** A monotonically increasing counter (MongoDB equivalent: a `counters` collection). */
export interface Sequence extends BaseEntity {
  /** `_id` is the entity name, e.g. `vendor`. */
  _id: SequenceEntity;
  prefix: string;
  padding: number;
  lastNumber: number;
}
