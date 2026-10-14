import { BUILT_IN_GOOGLE_CONNECTION } from '@/constants/googleConnection';
import type { ConfigSource, GoogleSheetConfig } from '@/domain/models/settings';
import { sheetConnectionSchema } from '@/domain/validation/schemas';

/**
 * Resolution of the Google Sheets connection.
 *
 * Only PUBLIC identifiers are handled here (OAuth Client ID, spreadsheet ID).
 * There is deliberately no field for a private key or client secret.
 *
 * Precedence (first complete match wins):
 *   1. device   — set by a Tech Admin in Settings → Google Sheets on this browser
 *   2. runtime  — `app-config.json` deployed next to the app (change without rebuild)
 *   3. build    — `VITE_GOOGLE_*` variables in a non-committed `.env.local`
 *   4. built-in — Milkly AI's own sheet (`src/constants/googleConnection.ts`)
 */
const DEVICE_KEY = 'milkly.connection.v1';

export interface ResolvedConnection {
  config: GoogleSheetConfig | null;
  source: ConfigSource;
  /** What the deployment (runtime file or build env) provides, for display. */
  deploymentDefaults: Partial<GoogleSheetConfig>;
}

function parse(candidate: unknown): GoogleSheetConfig | null {
  const result = sheetConnectionSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

function readDevice(): GoogleSheetConfig | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    return raw ? parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

async function readRuntimeFile(): Promise<Partial<GoogleSheetConfig>> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}app-config.json`, { cache: 'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) return {};
    const json = (await response.json()) as { googleOAuthClientId?: string; spreadsheetId?: string };
    return { oauthClientId: json.googleOAuthClientId ?? '', spreadsheetId: json.spreadsheetId ?? '' };
  } catch {
    return {};
  }
}

function readBuildEnv(): Partial<GoogleSheetConfig> {
  return {
    oauthClientId: import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? '',
    spreadsheetId: import.meta.env.VITE_GOOGLE_SPREADSHEET_ID ?? '',
  };
}

export async function resolveConnection(): Promise<ResolvedConnection> {
  const runtime = await readRuntimeFile();
  const env = readBuildEnv();
  const deploymentDefaults = {
    oauthClientId: runtime.oauthClientId || env.oauthClientId || BUILT_IN_GOOGLE_CONNECTION.oauthClientId,
    spreadsheetId: runtime.spreadsheetId || env.spreadsheetId || BUILT_IN_GOOGLE_CONNECTION.spreadsheetId,
  };
  const device = readDevice();
  if (device) return { config: device, source: 'device', deploymentDefaults };
  const fromRuntime = parse({ ...runtime, authMode: 'google-identity-services' });
  if (fromRuntime) return { config: fromRuntime, source: 'runtime-file', deploymentDefaults };
  const fromEnv = parse({ ...env, authMode: 'google-identity-services' });
  if (fromEnv) return { config: fromEnv, source: 'build-env', deploymentDefaults };
  const builtIn = parse({ ...BUILT_IN_GOOGLE_CONNECTION, authMode: 'google-identity-services' });
  if (builtIn) return { config: builtIn, source: 'built-in', deploymentDefaults };
  return { config: null, source: 'none', deploymentDefaults };
}

export function saveDeviceConnection(config: GoogleSheetConfig): void {
  const safe: GoogleSheetConfig = {
    spreadsheetId: config.spreadsheetId,
    oauthClientId: config.oauthClientId,
    authMode: config.authMode,
  };
  localStorage.setItem(DEVICE_KEY, JSON.stringify(safe));
}

export function clearDeviceConnection(): void {
  localStorage.removeItem(DEVICE_KEY);
}
