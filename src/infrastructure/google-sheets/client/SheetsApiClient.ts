import { AppError, type AppErrorCode } from '@/domain/errors/AppError';
import { backoffDelay, sleep } from '../../shared/async';

const API_ROOT = 'https://sheets.googleapis.com/v4/spreadsheets';

export type CellValue = string | number | boolean | null;
export type Row = CellValue[];

export interface ValueRange {
  range: string;
  values?: Row[];
}

/** Anything that can hand out a short-lived OAuth access token. */
export interface AccessTokenSource {
  getAccessToken(): Promise<string>;
  /** Called after a 401 so the source can drop a token Google rejected. */
  invalidateToken?(): void;
}

/**
 * - `read`/`meta`/`update`: idempotent; retried on 429/5xx/network errors.
 * - `append`/`structure`: NOT idempotent; retried only on 429 (Google rejected
 *   the call before executing it). A 5xx might have been applied, so it is
 *   surfaced instead of risking a duplicate row.
 */
type RequestKind = 'read' | 'meta' | 'update' | 'append' | 'structure';

interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string; details?: Array<{ reason?: string }> };
}

const MAX_RETRIES = 3;

/** Thin, typed wrapper over the Sheets REST API v4 (no gapi dependency). */
export class SheetsApiClient {
  constructor(
    readonly spreadsheetId: string,
    private readonly tokens: AccessTokenSource,
  ) {}

  getSpreadsheet<T>(fields: string): Promise<T> {
    return this.request<T>('GET', '', { kind: 'meta', query: { fields } });
  }

  async batchGet(ranges: readonly string[]): Promise<ValueRange[]> {
    if (!ranges.length) return [];
    const query = new URLSearchParams({
      majorDimension: 'ROWS',
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    for (const range of ranges) query.append('ranges', range);
    const response = await this.request<{ valueRanges?: ValueRange[] }>('GET', '/values:batchGet', {
      kind: 'read',
      query,
    });
    return response.valueRanges ?? [];
  }

  async updateValues(range: string, values: Row[]): Promise<void> {
    await this.request('PUT', `/values/${encodeURIComponent(range)}`, {
      kind: 'update',
      query: { valueInputOption: 'RAW' },
      body: { range, majorDimension: 'ROWS', values },
    });
  }

  async batchUpdateValues(data: Array<{ range: string; values: Row[] }>): Promise<void> {
    if (!data.length) return;
    await this.request('POST', '/values:batchUpdate', {
      kind: 'update',
      body: { valueInputOption: 'RAW', data: data.map((entry) => ({ ...entry, majorDimension: 'ROWS' })) },
    });
  }

  /** Appends rows after the last row of the table; returns the A1 range written. */
  async append(range: string, values: Row[]): Promise<string> {
    const response = await this.request<{ updates?: { updatedRange?: string } }>(
      'POST',
      `/values/${encodeURIComponent(range)}:append`,
      {
        kind: 'append',
        query: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', includeValuesInResponse: 'false' },
        body: { range, majorDimension: 'ROWS', values },
      },
    );
    const updatedRange = response.updates?.updatedRange;
    if (!updatedRange) throw new AppError('WRITE_FAILED', { details: 'Append response had no updatedRange' });
    return updatedRange;
  }

  batchUpdate<T = unknown>(requests: unknown[]): Promise<T> {
    return this.request<T>('POST', ':batchUpdate', { kind: 'structure', body: { requests } });
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    options: { kind: RequestKind; query?: Record<string, string> | URLSearchParams; body?: unknown },
  ): Promise<T> {
    const query = options.query instanceof URLSearchParams ? options.query : new URLSearchParams(options.query);
    const url = `${API_ROOT}/${encodeURIComponent(this.spreadsheetId)}${path}${query.size ? `?${query}` : ''}`;

    for (let attempt = 0; ; attempt += 1) {
      const token = await this.tokens.getAccessToken();
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
      } catch (cause) {
        const retryable = options.kind === 'read' || options.kind === 'meta' || options.kind === 'update';
        if (retryable && attempt < MAX_RETRIES) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        throw new AppError('NETWORK_ERROR', { cause, details: `${method} ${path}: ${String(cause)}` });
      }

      if (response.ok) {
        return (response.status === 204 ? undefined : await response.json()) as T;
      }

      const error = await this.toError(response, options.kind, `${method} ${path || '/'}`);
      const transient = response.status === 429 || response.status >= 500;
      const safeToRetry =
        response.status === 429 || (options.kind !== 'append' && options.kind !== 'structure');
      if (transient && safeToRetry && attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt + (response.status === 429 ? 1 : 0)));
        continue;
      }
      throw error;
    }
  }

  private async toError(response: Response, kind: RequestKind, operation: string): Promise<AppError> {
    let body: GoogleErrorBody = {};
    try {
      body = (await response.json()) as GoogleErrorBody;
    } catch {
      /* non-JSON error body */
    }
    const message = body.error?.message ?? response.statusText;
    const reasons = (body.error?.details ?? []).map((detail) => detail.reason ?? '').join(',');
    const details = `${operation} → HTTP ${response.status} ${body.error?.status ?? ''} ${message} ${reasons}`.trim();
    const isWrite = kind === 'update' || kind === 'append' || kind === 'structure';

    let code: AppErrorCode;
    let userMessage: string | undefined;
    switch (response.status) {
      case 400:
        if (/unable to parse range|no grid with id|not found.*sheet/i.test(message)) code = 'SHEET_MISSING';
        else if (/exceeds grid limits/i.test(message)) code = 'SCHEMA_MISMATCH';
        else code = isWrite ? 'WRITE_FAILED' : 'READ_FAILED';
        break;
      case 401:
        this.tokens.invalidateToken?.();
        code = 'AUTH_EXPIRED';
        break;
      case 403:
        if (/rate|quota/i.test(`${message} ${reasons} ${body.error?.status}`)) code = 'RATE_LIMITED';
        else if (/SERVICE_DISABLED|has not been used|is disabled/i.test(`${message} ${reasons}`)) {
          code = 'CONFIG_INVALID';
          userMessage = 'The Google Sheets API is not enabled for this Google Cloud project. A Tech Admin needs to enable it.';
        } else {
          code = 'SHEETS_PERMISSION_DENIED';
          if (isWrite) {
            userMessage =
              'Your Google account can view the spreadsheet but not edit it. Ask your Tech Admin to share it with you as an Editor.';
          }
        }
        break;
      case 404:
        code = 'SPREADSHEET_NOT_FOUND';
        break;
      case 429:
        code = 'RATE_LIMITED';
        break;
      default:
        code = isWrite ? 'WRITE_FAILED' : 'READ_FAILED';
        if (kind === 'append' && response.status >= 500) {
          userMessage =
            'Google did not confirm the save. Check whether the record was created before trying again.';
        }
    }
    return new AppError(code, { details, userMessage });
  }
}
