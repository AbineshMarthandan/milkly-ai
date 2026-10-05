/**
 * Application error model.
 *
 * Every failure that reaches the UI is an `AppError` with a stable `code` and a
 * `userMessage` that is safe to show to anyone. Raw technical details (HTTP
 * status, Google API payloads) live in `details` and are only revealed to Tech
 * Admins.
 */
export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'AUTH_FAILED'
  | 'USER_NOT_REGISTERED'
  | 'USER_DEACTIVATED'
  | 'PERMISSION_DENIED'
  | 'SHEETS_PERMISSION_DENIED'
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'SPREADSHEET_NOT_FOUND'
  | 'SHEET_MISSING'
  | 'SCHEMA_MISMATCH'
  | 'DATABASE_NOT_INITIALIZED'
  | 'VALIDATION'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'REFERENCED'
  | 'CONCURRENT_UPDATE'
  | 'READ_FAILED'
  | 'WRITE_FAILED'
  | 'UNKNOWN';

const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  AUTH_REQUIRED: 'Please sign in to continue.',
  AUTH_EXPIRED: 'Your session has expired. Please sign in again to continue.',
  AUTH_FAILED: 'Google sign-in did not complete. Please try again.',
  USER_NOT_REGISTERED: 'Your Google account is not registered in this application. Ask your Tech Admin to add you.',
  USER_DEACTIVATED: 'Your account has been deactivated. Contact your Tech Admin.',
  PERMISSION_DENIED: 'You do not have permission to perform this action.',
  SHEETS_PERMISSION_DENIED:
    'Your Google account cannot access the business spreadsheet. Ask your Tech Admin to share it with you as an Editor.',
  NETWORK_ERROR: 'Cannot reach Google right now. Check your internet connection and try again.',
  RATE_LIMITED: 'Google is receiving too many requests. Wait a few seconds and try again.',
  CONFIG_MISSING: 'The application is not connected to a database yet. A Tech Admin needs to complete setup.',
  CONFIG_INVALID: 'The database connection settings are invalid. A Tech Admin needs to review them.',
  SPREADSHEET_NOT_FOUND: 'The business spreadsheet could not be found. A Tech Admin needs to review the connection.',
  SHEET_MISSING: 'The spreadsheet is missing a required tab. A Tech Admin needs to repair the sheet structure.',
  SCHEMA_MISMATCH: 'The spreadsheet structure does not match what the app expects. A Tech Admin needs to repair it.',
  DATABASE_NOT_INITIALIZED: 'The spreadsheet has not been initialised yet.',
  VALIDATION: 'Some information is missing or invalid.',
  DUPLICATE: 'A record with the same details already exists.',
  NOT_FOUND: 'The record could not be found. It may have been removed.',
  REFERENCED: 'This record is used elsewhere and cannot be deleted. Deactivate it instead.',
  CONCURRENT_UPDATE: 'Someone else changed this record while you were editing. Reload it and try again.',
  READ_FAILED: 'Could not load data. Please try again.',
  WRITE_FAILED: 'Could not save your changes. Please try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export interface AppErrorOptions {
  userMessage?: string;
  /** Technical diagnostics — shown to Tech Admins only. */
  details?: string;
  cause?: unknown;
  /** Field-level messages for validation errors. */
  fieldErrors?: Record<string, string>;
  retryable?: boolean;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly details?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly retryable: boolean;

  constructor(code: AppErrorCode, options: AppErrorOptions = {}) {
    const userMessage = options.userMessage ?? DEFAULT_MESSAGES[code];
    super(userMessage, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.details = options.details;
    this.fieldErrors = options.fieldErrors;
    this.retryable = options.retryable ?? (code === 'NETWORK_ERROR' || code === 'RATE_LIMITED');
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Normalises anything thrown into an `AppError` without leaking raw messages to users. */
export function toAppError(error: unknown, fallback: AppErrorCode = 'UNKNOWN'): AppError {
  if (isAppError(error)) return error;
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return new AppError('NETWORK_ERROR', { details: error.message, cause: error });
  }
  const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return new AppError(fallback, { details, cause: error });
}

export const validationError = (fieldErrors: Record<string, string>, userMessage?: string) =>
  new AppError('VALIDATION', {
    fieldErrors,
    userMessage: userMessage ?? Object.values(fieldErrors)[0] ?? DEFAULT_MESSAGES.VALIDATION,
  });
