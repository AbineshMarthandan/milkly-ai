import { create } from 'zustand';
import type { Identity, IdentityProvider } from '@/domain/auth/identity';
import type { AppError } from '@/domain/errors/AppError';
import type { User } from '@/domain/models';
import type { DataSource } from '@/domain/repositories';
import type { AppServices } from '@/domain/services';
import type { ResolvedConnection } from '@/infrastructure/config/connectionConfig';

export type SessionStatus =
  | 'booting'
  | 'signed-out'
  | 'signing-in'
  /** Signed in to Google, but the spreadsheet has no users yet. */
  | 'needs-initialization'
  | 'authenticated';

export type SessionMode = 'google' | 'demo';

export interface SessionState {
  status: SessionStatus;
  mode: SessionMode | null;
  connection: ResolvedConnection | null;
  identity: Identity | null;
  user: User | null;
  provider: IdentityProvider | null;
  dataSource: DataSource | null;
  services: AppServices | null;
  /** Last sign-in failure, shown on the login screen. */
  error: AppError | null;
  /** The Google token expired; a user gesture is needed to renew it. */
  reauthRequired: boolean;
}

export const initialSessionState: SessionState = {
  status: 'booting',
  mode: null,
  connection: null,
  identity: null,
  user: null,
  provider: null,
  dataSource: null,
  services: null,
  error: null,
  reauthRequired: false,
};

/**
 * Client-side session state. Holds object references only in memory: the
 * Google access token lives inside the identity provider and is never put in
 * this store or in browser storage.
 */
export const useSessionStore = create<SessionState>(() => initialSessionState);
