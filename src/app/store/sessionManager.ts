import type { Identity, IdentityProvider } from '@/domain/auth/identity';
import { AppError, toAppError } from '@/domain/errors/AppError';
import type { Actor, GoogleSheetConfig, User } from '@/domain/models';
import type { DataSource } from '@/domain/repositories';
import { BootstrapService, SessionService, createServices } from '@/domain/services';
import { BrowserDemoDataSource, DemoIdentityProvider } from '@/infrastructure/browser-demo/BrowserDemoDataSource';
import { LocalDatabase } from '@/infrastructure/browser-demo/LocalDatabase';
import {
  clearDeviceConnection,
  isDemoModeEnabled,
  resolveConnection,
  saveDeviceConnection,
} from '@/infrastructure/config/connectionConfig';
import { GoogleIdentityProvider } from '@/infrastructure/google/GoogleIdentityProvider';
import { GoogleSheetsDataSource } from '@/infrastructure/google-sheets/GoogleSheetsDataSource';
import { SCHEMA_VERSION } from '@/infrastructure/google-sheets/schemas/sheetSchemas';
import { createAuditContext } from '@/infrastructure/shared/audit';
import { queryClient } from '../providers/queryClient';
import { initialSessionState, useSessionStore } from './sessionStore';

/** Non-sensitive UI preferences (no tokens, no secrets). */
const PREFS_KEY = 'milkly.session.v1';
interface SessionPrefs {
  mode?: 'google' | 'demo';
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

function activate(user: User, identity: Identity, provider: IdentityProvider, dataSource: DataSource, mode: 'google' | 'demo') {
  currentActor = toActor(user);
  queryClient.clear();
  useSessionStore.setState({
    status: 'authenticated',
    mode,
    identity,
    user,
    provider,
    dataSource,
    services: createServices(dataSource, serviceContext),
    error: null,
    reauthRequired: false,
  });
  writePrefs({ mode, lastEmail: identity.email });
}

async function completeSignIn(identity: Identity, provider: IdentityProvider, dataSource: DataSource, mode: 'google' | 'demo') {
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
    useSessionStore.setState({ status: 'needs-initialization', mode, identity, provider, dataSource, error: null });
    return;
  }
  const user = await sessions.resolveUser(identity);
  currentActor = toActor(user);
  await sessions.recordLogin(user);
  activate(user, identity, provider, dataSource, mode);
}

function fail(error: unknown) {
  currentActor = null;
  useSessionStore.setState({ ...initialSessionState, status: 'signed-out', connection: useSessionStore.getState().connection, error: toAppError(error) });
}

export const sessionManager = {
  isDemoEnabled: isDemoModeEnabled,

  /** Resolves the connection and restores a demo session if one was active. */
  async boot(): Promise<void> {
    const connection = await resolveConnection();
    useSessionStore.setState({ connection, status: 'signed-out' });
    const prefs = readPrefs();
    if (prefs.mode === 'demo' && prefs.lastEmail && isDemoModeEnabled()) {
      await this.signInDemo(prefs.lastEmail).catch(() => undefined);
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
      const identity = await provider.signIn({ loginHint: prefs.mode === 'google' ? prefs.lastEmail : undefined });
      const dataSource = new GoogleSheetsDataSource({
        config,
        tokens: provider,
        audit: auditContext,
        identityEmail: () => provider.currentIdentity?.email ?? null,
      });
      await completeSignIn(identity, provider, dataSource, 'google');
    } catch (error) {
      await provider.signOut().catch(() => undefined);
      fail(error);
    }
  },

  async signInDemo(email: string): Promise<void> {
    useSessionStore.setState({ status: 'signing-in', error: null });
    try {
      const provider = new DemoIdentityProvider();
      const identity = await provider.signIn({ loginHint: email });
      await completeSignIn(identity, provider, new BrowserDemoDataSource(auditContext), 'demo');
    } catch (error) {
      fail(error);
    }
  },

  /** First run on an empty spreadsheet: create the tabs and make this user Tech Admin. */
  async initializeDatabase(): Promise<void> {
    const { dataSource, identity, provider, mode } = useSessionStore.getState();
    if (!dataSource || !identity || !provider || !mode) throw new AppError('AUTH_REQUIRED');
    await dataSource.admin.repairStructure();
    dataSource.clearCache();
    const user = await new BootstrapService(dataSource, (actor) => {
      currentActor = actor;
    }).initialize(identity, SCHEMA_VERSION);
    activate(user, identity, provider, dataSource, mode);
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

  /** Restores the demo's sample data. */
  async resetDemoData(): Promise<void> {
    const { dataSource } = useSessionStore.getState();
    if (dataSource instanceof BrowserDemoDataSource) dataSource.reset();
    else LocalDatabase.clearStored();
    await queryClient.invalidateQueries();
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
