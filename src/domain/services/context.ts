import type { Actor } from '../models/common';

/** What application services need to know about the current request. */
export interface ServiceContext {
  /** The signed-in user, or `null` before sign-in completes. */
  getActor(): Actor | null;
}
