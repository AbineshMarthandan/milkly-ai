import type { Identity, IdentityProvider } from '@/domain/auth/identity';
import { AppError } from '@/domain/errors/AppError';
import type { AccessTokenSource } from '../google-sheets/client/SheetsApiClient';

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SCOPES = [SHEETS_SCOPE, 'openid', 'email', 'profile'].join(' ');
/** Treat tokens as expired slightly early so a request never races expiry. */
const EXPIRY_MARGIN_MS = 60_000;
/** This tab's sign-in, so a page refresh does not sign the user out. */
const SESSION_KEY = 'milkly.googleSession.v1';

interface StoredSession {
  clientId: string;
  token: string;
  expiresAt: number;
  identity: Identity;
}

let scriptLoading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  scriptLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoading = null;
      reject(new AppError('NETWORK_ERROR', { userMessage: 'Could not load Google sign-in. Check your connection.' }));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

/**
 * Browser-only Google authentication using the GIS OAuth 2.0 token model.
 *
 * - No client secret or private key exists anywhere: the OAuth Client ID is a
 *   public identifier and Google returns a short-lived (~1 h) access token
 *   directly to this page.
 * - The token is kept in memory and in this tab's sessionStorage, so a page
 *   refresh keeps the user signed in. sessionStorage is cleared when the tab
 *   closes and is never shared with other tabs; the token itself expires after
 *   about an hour, and signing out removes it. It is never put in localStorage.
 * - Each user acts with their own Google account, so the spreadsheet's Drive
 *   sharing settings are the ultimate access control.
 */
export class GoogleIdentityProvider implements IdentityProvider, AccessTokenSource {
  readonly kind = 'google' as const;
  private token: { value: string; expiresAt: number } | null = null;
  private identity: Identity | null = null;
  private client: google.accounts.oauth2.TokenClient | null = null;
  private pending: { resolve: () => void; reject: (error: unknown) => void } | null = null;
  /** Set when the user left the Sheets box unticked, so the next attempt shows Google's permission screen again. */
  private sheetsDeclined = false;

  constructor(private readonly clientId: string) {}

  /** Load GIS ahead of the click, so the popup opens inside the user gesture. */
  async prepare(): Promise<void> {
    if (this.client) return;
    await loadScript();
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) throw new AppError('AUTH_FAILED', { details: 'GIS loaded without accounts.oauth2' });
    this.client = oauth2.initTokenClient({
      client_id: this.clientId,
      scope: SCOPES,
      include_granted_scopes: true,
      callback: (response) => this.handleToken(response),
      error_callback: (error) => this.handleClientError(error),
    });
  }

  async signIn(options: { loginHint?: string } = {}): Promise<Identity> {
    await this.requestToken({ prompt: '', login_hint: options.loginHint });
    this.identity = await this.fetchIdentity();
    this.saveSession();
    return this.identity;
  }

  /** Picks up this tab's sign-in after a page refresh, if its token is still valid. */
  restoreSession(): Identity | null {
    try {
      const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as StoredSession | null;
      if (!stored || stored.clientId !== this.clientId || Date.now() >= stored.expiresAt - EXPIRY_MARGIN_MS) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      this.token = { value: stored.token, expiresAt: stored.expiresAt };
      this.identity = stored.identity;
      return stored.identity;
    } catch {
      return null;
    }
  }

  async reauthenticate(): Promise<void> {
    const previous = this.identity?.email;
    await this.requestToken({ prompt: '', login_hint: previous });
    const identity = await this.fetchIdentity();
    if (previous && identity.email !== previous) {
      this.token = null;
      throw new AppError('AUTH_FAILED', {
        userMessage: `You signed in as ${identity.email}. Please continue with ${previous}, or sign out first.`,
      });
    }
    this.identity = identity;
    this.saveSession();
  }

  async signOut(): Promise<void> {
    const token = this.token?.value;
    this.token = null;
    this.identity = null;
    this.clearSession();
    if (token) window.google?.accounts?.oauth2?.revoke(token);
  }

  async getAccessToken(): Promise<string> {
    if (!this.token) throw new AppError(this.identity ? 'AUTH_EXPIRED' : 'AUTH_REQUIRED');
    if (Date.now() >= this.token.expiresAt - EXPIRY_MARGIN_MS) throw new AppError('AUTH_EXPIRED');
    return this.token.value;
  }

  invalidateToken(): void {
    this.token = null;
    this.clearSession();
  }

  get currentIdentity(): Identity | null {
    return this.identity;
  }

  private saveSession() {
    if (!this.token || !this.identity) return;
    const stored: StoredSession = { clientId: this.clientId, token: this.token.value, expiresAt: this.token.expiresAt, identity: this.identity };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    } catch {
      /* Storage unavailable (e.g. private mode): the user signs in again after a refresh. */
    }
  }

  private clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignored */
    }
  }

  private requestToken(overrides: google.accounts.oauth2.OverridableTokenClientConfig): Promise<void> {
    const start = () =>
      new Promise<void>((resolve, reject) => {
        this.pending?.reject(new AppError('AUTH_FAILED', { userMessage: 'Sign-in was restarted.' }));
        this.pending = { resolve, reject };
        // Must run synchronously inside the click handler when `client` is
        // ready, or the browser's popup blocker may stop the Google window.
        this.client!.requestAccessToken(this.sheetsDeclined ? { ...overrides, prompt: 'consent' } : overrides);
      });
    return this.client ? start() : this.prepare().then(start);
  }

  private handleToken(response: google.accounts.oauth2.TokenResponse) {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    if (response.error || !response.access_token) {
      pending.reject(new AppError('AUTH_FAILED', { details: `${response.error}: ${response.error_description ?? ''}` }));
      return;
    }
    if (!window.google?.accounts?.oauth2?.hasGrantedAllScopes(response, SHEETS_SCOPE)) {
      this.sheetsDeclined = true;
      pending.reject(
        new AppError('AUTH_FAILED', {
          userMessage:
            'Google Sheets access was not allowed, and the app keeps its data in your spreadsheet. Sign in again and, on Google’s permission screen, tick “Select all” (or “See, edit, create and delete all your Google Sheets spreadsheets”) before pressing Continue.',
        }),
      );
      return;
    }
    this.sheetsDeclined = false;
    this.token = { value: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 };
    pending.resolve();
  }

  private handleClientError(error: google.accounts.oauth2.ClientConfigError) {
    const pending = this.pending;
    this.pending = null;
    const userMessage =
      error.type === 'popup_failed_to_open'
        ? 'The Google sign-in window was blocked. Allow pop-ups for this site and try again.'
        : error.type === 'popup_closed'
          ? 'The Google sign-in window was closed before sign-in finished.'
          : undefined;
    pending?.reject(new AppError('AUTH_FAILED', { userMessage, details: `${error.type}: ${error.message ?? ''}` }));
  }

  private async fetchIdentity(): Promise<Identity> {
    let response: Response;
    try {
      response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${await this.getAccessToken()}` },
      });
    } catch (cause) {
      throw new AppError('NETWORK_ERROR', { cause });
    }
    if (!response.ok) throw new AppError('AUTH_FAILED', { details: `userinfo HTTP ${response.status}` });
    const profile = (await response.json()) as { email?: string; email_verified?: boolean; name?: string; picture?: string };
    if (!profile.email || profile.email_verified === false) {
      throw new AppError('AUTH_FAILED', { userMessage: 'Your Google account e-mail is not verified.' });
    }
    return { email: profile.email.toLowerCase(), name: profile.name ?? profile.email, pictureUrl: profile.picture };
  }
}
