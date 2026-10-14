import type { Identity, IdentityProvider } from '@/domain/auth/identity';
import { AppError, toAppError } from '@/domain/errors/AppError';
import type { Actor, GoogleSheetConfig, User } from '@/domain/models';
import type { DataSource } from '@/domain/repositories';
import { BootstrapService, SessionService, createServices } from '@/domain/services';
import { useBillDraftStore } from '@/features/billing/billDraftStore';
import { clearDeviceConnection, resolveConnection, saveDeviceConnection } from '@/infrastructure/config/connectionConfig';
import { GoogleIdentityProvider } from '@/infrastructure/google/GoogleIdentityProvider';
import { GoogleSheetsDataSource } from '@/infrastructure/google-sheets/GoogleSheetsDataSource';
import { SCHEMA_VERSION } from '@/infrastructure/google-sheets/schemas/sheetSchemas';
import { createAuditContext } from '@/infrastructure/shared/audit';
import { queryClient } from '../providers/queryClient';
import { initialSessionState, useSessionStore } from './sessionStore';

/** Non-sensitive UI preferences (no tokens, no secrets). */
const PREFS_KEY = 'milkly.session.v1';
interface SessionPrefs {
  lastEmail?: string;
}

function readPrefs(): SessionPrefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as SessionPrefs;
  } catch {
    return {};
  }
}

function writePrefs(prefs: SessionPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignored */
  }
}

/**
 * Clears what the retired browser-only demo left behind: its sample data, its
 * sign-in hint, and unsaved bill drafts that point at demo products and stores.
 */
function removeLegacyDemoData() {
  try {
    const usedDemo = localStorage.getItem('milkly.demo.v1') !== null || (JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as { mode?: string }).mode === 'demo';
    if (!usedDemo) return;
    localStorage.removeItem('milkly.demo.v1');
    localStorage.removeItem(PREFS_KEY);
    useBillDraftStore.setState({ drafts: {} });
  } catch {
    /* ignored */
  }
}

/** The signed-in actor, read by services (permissions) and repositories (audit stamps). */
let currentActor: Actor | null = null;
const serviceContext = { getActor: () => currentActor };
const auditContext = createAuditContext(() => currentActor?.userId);

let googleProvider: GoogleIdentityProvider | null = null;
let googleProviderClientId: string | null = null;

function toActor(user: User): Actor {
  return { userId: user._id, email: user.email, displayName: user.displayName, role: user.role };
}

function getGoogleProvider(config: GoogleSheetConfig): GoogleIdentityProvider {
  if (!googleProvider || googleProviderClientId !== config.oauthClientId) {
    googleProvider = new GoogleIdentityProvider(config.oauthClientId);
    googleProviderClientId = config.oauthClientId;
  }
  return googleProvider;
}

function activate(user: User, identity: Identity, provider: IdentityProvider, dataSource: DataSource) {
  currentActor = toActor(user);
  queryClient.clear();
  useSessionStore.setState({
    status: 'authenticated',
    identity,
    user,
    provider,
    dataSource,
    services: createServices(dataSource, serviceContext),
    error: null,
    reauthRequired: false,
  });
  writePrefs({ lastEmail: identity.email });
}

/** `recordLogin` is false when a page refresh restores a session, so reloads are not counted as logins. */
async function completeSignIn(identity: Identity, provider: IdentityProvider, dataSource: DataSource, recordLogin = true) {
  const sessions = new SessionService(dataSource.users);
  let hasUsers: boolean;
  try {
    hasUsers = await sessions.hasAnyUser();
  } catch (error) {
    const appError = toAppError(error);
    // A brand-new spreadsheet has no `users` tab yet.
    if (appError.code !== 'SHEET_MISSING' && appError.code !== 'SCHEMA_MISMATCH') throw appError;
    hasUsers = false;
  }
  if (!hasUsers) {
    useSessionStore.setState({ status: 'needs-initialization', identity, provider, dataSource, error: null });
    return;
  }
  const user = await sessions.resolveUser(identity);
  currentActor = toActor(user);
  if (recordLogin) await sessions.recordLogin(user);
  activate(user, identity, provider, dataSource);
}

function sheetsDataSource(config: GoogleSheetConfig, provider: GoogleIdentityProvider): GoogleSheetsDataSource {
  return new GoogleSheetsDataSource({
    config,
    tokens: provider,
    audit: auditContext,
    identityEmail: () => provider.currentIdentity?.email ?? null,
  });
}

function fail(error: unknown) {
  currentActor = null;
  useSessionStore.setState({ ...initialSessionState, status: 'signed-out', connection: useSessionStore.getState().connection, error: toAppError(error) });
}

export const sessionManager = {
  /** Resolves the Google Sheets connection and, after a page refresh, restores this tab's sign-in. */
  async boot(): Promise<void> {
    removeLegacyDemoData();
    const connection = await resolveConnection();
    useSessionStore.setState({ connection });
    const provider = connection.config ? getGoogleProvider(connection.config) : null;
    const identity = provider?.restoreSession();
    if (!provider || !identity || !connection.config) {
      useSessionStore.setState({ status: 'signed-out' });
      return;
    }
    try {
      await completeSignIn(identity, provider, sheetsDataSource(connection.config, provider), false);
      // Load Google's script now, so the popup that renews an expired token opens within the click.
      void provider.prepare().catch(() => undefined);
    } catch (error) {
      await provider.signOut().catch(() => undefined);
      fail(error);
    }
  },

  lastEmail(): string | undefined {
    return readPrefs().lastEmail;
  },

  /** Loads Google's script early so the sign-in popup opens within the click. */
  prepareGoogle(): void {
    const config = useSessionStore.getState().connection?.config;
    if (config) void getGoogleProvider(config).prepare().catch(() => undefined);
  },

  async signInWithGoogle(): Promise<void> {
    const config = useSessionStore.getState().connection?.config;
    if (!config) throw new AppError('CONFIG_MISSING');
    const provider = getGoogleProvider(config);
    useSessionStore.setState({ status: 'signing-in', error: null });
    try {
      const prefs = readPrefs();
      const identity = await provider.signIn({ loginHint: prefs.lastEmail });
      await completeSignIn(identity, provider, sheetsDataSource(config, provider));
    } catch (error) {
      await provider.signOut().catch(() => undefined);
      fail(error);
    }
  },

  /** First run on an empty spreadsheet: create the tabs and make this user Tech Admin. */
  async initializeDatabase(): Promise<void> {
    const { dataSource, identity, provider } = useSessionStore.getState();
    if (!dataSource || !identity || !provider) throw new AppError('AUTH_REQUIRED');
    await dataSource.admin.repairStructure();
    dataSource.clearCache();
    const user = await new BootstrapService(dataSource, (actor) => {
      currentActor = actor;
    }).initialize(identity, SCHEMA_VERSION);
    activate(user, identity, provider, dataSource);
  },

  /** Renews an expired Google token. Must be called from a click handler. */
  async reauthenticate(): Promise<void> {
    const { provider } = useSessionStore.getState();
    if (!provider) throw new AppError('AUTH_REQUIRED');
    await provider.reauthenticate();
    useSessionStore.setState({ reauthRequired: false });
    await queryClient.invalidateQueries();
  },

  async signOut(): Promise<void> {
    const { provider, connection } = useSessionStore.getState();
    await provider?.signOut().catch(() => undefined);
    currentActor = null;
    queryClient.clear();
    writePrefs({ lastEmail: readPrefs().lastEmail });
    useSessionStore.setState({ ...initialSessionState, status: 'signed-out', connection });
  },

  /** Saves a device-level connection (Tech Admin) and signs out so it takes effect. */
  async applyConnection(config: GoogleSheetConfig): Promise<void> {
    saveDeviceConnection(config);
    await this.signOut();
    useSessionStore.setState({ connection: await resolveConnection() });
  },

  async resetConnectionToDeployment(): Promise<void> {
    clearDeviceConnection();
    await this.signOut();
    useSessionStore.setState({ connection: await resolveConnection() });
  },

  /** Keeps the signed-in user in sync after they edit their own record. */
  syncCurrentUser(user: User): void {
    if (useSessionStore.getState().user?._id !== user._id) return;
    currentActor = toActor(user);
    useSessionStore.setState({ user });
  },

  /** Drops data-source caches and refetches everything on screen. */
  async refreshData(): Promise<void> {
    useSessionStore.getState().dataSource?.clearCache();
    await queryClient.invalidateQueries();
  },
};
