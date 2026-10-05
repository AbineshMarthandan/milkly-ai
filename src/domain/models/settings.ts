import type { EntityId, IsoDateTime } from './common';

/** Print formats. Thermal formats are continuous rolls; A4/A5 are sheet invoices. */
export const PAPER_SIZES = ['THERMAL_80', 'THERMAL_58', 'A4', 'A5'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

export const PAPER_SIZE_LABELS: Record<PaperSize, string> = {
  THERMAL_80: 'Thermal receipt — 80 mm roll',
  THERMAL_58: 'Thermal receipt — 58 mm roll',
  A4: 'A4 invoice',
  A5: 'A5 invoice',
};

export function isThermal(size: PaperSize): size is 'THERMAL_80' | 'THERMAL_58' {
  return size === 'THERMAL_80' || size === 'THERMAL_58';
}

/** Business-facing configuration (settings document `_id: "app"`). */
export interface AppSettings {
  businessName: string;
  businessAddress: string;
  phone: string;
  /** Optional tax registration number printed on invoices (e.g. GSTIN). */
  taxId: string;
  invoiceFooter: string;
  /** ISO 4217 code, e.g. `INR`. */
  currency: string;
  paperSize: PaperSize;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  businessName: 'Milkly Distributors',
  businessAddress: '',
  phone: '',
  taxId: '',
  invoiceFooter: 'Thank you for your business!',
  currency: 'INR',
  paperSize: 'THERMAL_80',
};

/** A versioned document stored in the `settings` collection. */
export interface SettingsDocument<T> {
  _id: string;
  data: T;
  version: number;
  createdAt: IsoDateTime;
  createdBy: EntityId;
  updatedAt: IsoDateTime;
  updatedBy: EntityId;
}

export const SETTINGS_KEYS = {
  app: 'app',
  /** Non-secret record of how the database was initialised (schema version, who, when). */
  database: 'database',
  /** Written by "Test connection" to prove write access. */
  diagnostics: 'diagnostics',
} as const;

export interface DatabaseMetadata {
  schemaVersion: number;
  initializedAt: IsoDateTime;
  initializedBy: EntityId;
}

export const AUTH_MODES = ['google-identity-services'] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

/**
 * Connection details for the Google Sheets database.
 *
 * Every field is a *public identifier*, not a secret: the OAuth client ID is
 * visible in Google's sign-in URL and the spreadsheet ID is protected by Google
 * Drive sharing, not by secrecy. Private keys are never part of this model.
 */
export interface GoogleSheetConfig {
  spreadsheetId: string;
  oauthClientId: string;
  authMode: AuthMode;
}

/** Where the active connection configuration came from. */
export type ConfigSource = 'device' | 'runtime-file' | 'build-env' | 'none';
