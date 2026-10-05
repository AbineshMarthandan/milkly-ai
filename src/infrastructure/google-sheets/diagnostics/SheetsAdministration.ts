import { AppError, toAppError } from '@/domain/errors/AppError';
import { SETTINGS_KEYS } from '@/domain/models/settings';
import { SEQUENCE_ENTITIES, type Sequence } from '@/domain/models/sequence';
import type {
  CollectionStatus,
  DatabaseAdministration,
  DiagnosticCheck,
  RepairResult,
  SettingsRepository,
  StructureReport,
} from '@/domain/repositories';
import { ID_FORMATS } from '@/domain/services/ids';
import { stampCreate, type AuditContext } from '../../shared/audit';
import { columnLetter, quoteSheet } from '../client/a1';
import type { AccessTokenSource, Row, SheetsApiClient } from '../client/SheetsApiClient';
import type { SheetLayout } from '../core/SheetLayout';
import { documentToRow, indexHeader } from '../mappers/rowMapper';
import { COLLECTIONS, SHEET_SCHEMAS, columnKeys, type CollectionName } from '../schemas/sheetSchemas';

interface SheetMeta {
  properties?: { title?: string };
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
      gridProperties?: { rowCount?: number; columnCount?: number; frozenRowCount?: number };
    };
    protectedRanges?: Array<{ protectedRangeId?: number; description?: string }>;
  }>;
}

const META_FIELDS =
  'properties.title,sheets(properties(sheetId,title,gridProperties(rowCount,columnCount,frozenRowCount)),protectedRanges(protectedRangeId,description))';
const HEADER_PROTECTION = 'milkly-ai:header-row';
const ADMIN_PROTECTION = 'milkly-ai:tech-admin-only';
const ADMIN_COLLECTIONS: CollectionName[] = ['users', 'settings'];

interface Inspection {
  meta: SheetMeta;
  report: StructureReport;
  headers: Map<string, Row>;
}

/** Google-Sheets implementation of the Tech-Admin maintenance operations. */
export class SheetsAdministration implements DatabaseAdministration {
  constructor(
    private readonly client: SheetsApiClient,
    private readonly tokens: AccessTokenSource,
    private readonly layout: SheetLayout,
    private readonly settings: SettingsRepository,
    private readonly audit: AuditContext,
    private readonly identityEmail: () => string | null,
  ) {}

  get externalUrl() {
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(this.client.spreadsheetId)}/edit`;
  }

  async inspectStructure(): Promise<StructureReport> {
    return (await this.inspect()).report;
  }

  async testConnection(): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];
    const skipRest = (from: DiagnosticCheck['id'][]) => {
      const labels: Record<string, string> = {
        database: 'Spreadsheet access',
        collections: 'Required sheets',
        fields: 'Sheet columns',
        read: 'Read permission',
        write: 'Write permission',
      };
      for (const id of from) checks.push({ id, label: labels[id], status: 'skipped', message: 'Skipped because an earlier check failed.' });
    };

    try {
      await this.tokens.getAccessToken();
      checks.push({ id: 'auth', label: 'Authentication', status: 'pass', message: `Signed in as ${this.identityEmail() ?? 'Google user'}.` });
    } catch (error) {
      checks.push(failure('auth', 'Authentication', error));
      skipRest(['database', 'collections', 'fields', 'read', 'write']);
      return checks;
    }

    let inspection: Inspection;
    try {
      inspection = await this.inspect();
      checks.push({ id: 'database', label: 'Spreadsheet access', status: 'pass', message: `Opened “${inspection.report.title}”.` });
    } catch (error) {
      checks.push(failure('database', 'Spreadsheet access', error));
      skipRest(['collections', 'fields', 'read', 'write']);
      return checks;
    }

    const { collections } = inspection.report;
    const missing = collections.filter((collection) => !collection.exists).map((collection) => collection.name);
    checks.push(
      missing.length
        ? { id: 'collections', label: 'Required sheets', status: 'fail', message: `Missing tabs: ${missing.join(', ')}. Use “Repair sheet structure”.` }
        : { id: 'collections', label: 'Required sheets', status: 'pass', message: `All ${collections.length} tabs are present.` },
    );

    const broken = collections.filter((collection) => collection.exists && collection.missingFields.length);
    const unknown = collections.filter((collection) => collection.unknownFields.length);
    checks.push(
      broken.length
        ? {
            id: 'fields',
            label: 'Sheet columns',
            status: 'fail',
            message: `Missing columns in: ${broken.map((c) => `${c.name} (${c.missingFields.join(', ')})`).join('; ')}.`,
          }
        : unknown.length
          ? {
              id: 'fields',
              label: 'Sheet columns',
              status: 'warn',
              message: `Extra columns are ignored: ${unknown.map((c) => `${c.name} (${c.unknownFields.join(', ')})`).join('; ')}.`,
            }
          : { id: 'fields', label: 'Sheet columns', status: 'pass', message: 'Every tab has the expected columns.' },
    );

    // The inspection above already read every header row, which proves read access.
    checks.push({ id: 'read', label: 'Read permission', status: 'pass', message: 'Data can be read.' });

    if (!collections.find((collection) => collection.name === 'settings')?.exists) {
      checks.push({ id: 'write', label: 'Write permission', status: 'skipped', message: 'The settings tab is missing.' });
      return checks;
    }
    try {
      await this.settings.save(SETTINGS_KEYS.diagnostics, {
        lastWriteTestAt: new Date().toISOString(),
        by: this.identityEmail(),
      });
      checks.push({ id: 'write', label: 'Write permission', status: 'pass', message: 'A test value was written to settings.' });
    } catch (error) {
      checks.push(failure('write', 'Write permission', error));
    }
    return checks;
  }

  async repairStructure(): Promise<RepairResult> {
    const { meta, report, headers } = await this.inspect();
    const sheetsByTitle = new Map((meta.sheets ?? []).map((sheet) => [sheet.properties?.title ?? '', sheet]));
    const created: string[] = [];
    const addedFields: Record<string, string[]> = {};
    const structural: unknown[] = [];
    const headerWrites: Array<{ range: string; values: Row[] }> = [];

    for (const status of report.collections) {
      const schema = SHEET_SCHEMAS[status.name as CollectionName];
      const keys = columnKeys(schema);
      if (!status.exists) {
        created.push(schema.name);
        structural.push({
          addSheet: {
            properties: {
              title: schema.name,
              gridProperties: { rowCount: 1000, columnCount: Math.max(26, keys.length), frozenRowCount: 1 },
            },
          },
        });
        headerWrites.push({ range: `${quoteSheet(schema.name)}!A1`, values: [keys] });
        continue;
      }
      const sheet = sheetsByTitle.get(schema.name);
      const sheetId = sheet?.properties?.sheetId;
      const grid = sheet?.properties?.gridProperties ?? {};
      const headerWidth = headers.get(schema.name)?.length ?? 0;
      const neededColumns = headerWidth + status.missingFields.length;
      if (sheetId !== undefined && (grid.columnCount ?? 26) < neededColumns) {
        structural.push({
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { columnCount: neededColumns } },
            fields: 'gridProperties.columnCount',
          },
        });
      }
      if (sheetId !== undefined && !grid.frozenRowCount) {
        structural.push({
          updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' },
        });
      }
      if (status.missingFields.length) {
        addedFields[schema.name] = status.missingFields;
        headerWrites.push({ range: `${quoteSheet(schema.name)}!${columnLetter(headerWidth)}1`, values: [status.missingFields] });
      }
    }

    if (structural.length) await this.client.batchUpdate(structural);
    await this.client.batchUpdateValues(headerWrites);
    this.layout.invalidate();

    if (created.includes('sequences')) await this.seedSequences();
    await this.protectHeaderRows();
    return { createdCollections: created, addedFields };
  }

  /**
   * Makes `users` and `settings` editable only by the given accounts (plus the
   * spreadsheet owner, whom Google never locks out). This is the storage-level
   * guard behind the app's role checks for the most sensitive tabs.
   */
  async restrictAdminCollections(editorEmails: string[]): Promise<string[]> {
    const editors = [...new Set([...editorEmails, this.identityEmail() ?? ''].filter(Boolean).map((e) => e.toLowerCase()))];
    if (!editors.length) throw new AppError('VALIDATION', { userMessage: 'At least one Tech Admin e-mail is required.' });
    const meta = await this.client.getSpreadsheet<SheetMeta>(META_FIELDS);
    const requests: unknown[] = [];
    const protectedNames: string[] = [];
    for (const name of ADMIN_COLLECTIONS) {
      const sheet = meta.sheets?.find((candidate) => candidate.properties?.title === name);
      const sheetId = sheet?.properties?.sheetId;
      if (sheetId === undefined) continue;
      protectedNames.push(name);
      const existing = sheet?.protectedRanges?.find((range) => range.description === ADMIN_PROTECTION);
      const protectedRange = {
        range: { sheetId },
        description: ADMIN_PROTECTION,
        warningOnly: false,
        editors: { users: editors },
      };
      requests.push(
        existing?.protectedRangeId !== undefined
          ? {
              updateProtectedRange: {
                protectedRange: { ...protectedRange, protectedRangeId: existing.protectedRangeId },
                fields: 'editors,warningOnly,description',
              },
            }
          : { addProtectedRange: { protectedRange } },
      );
    }
    if (requests.length) await this.client.batchUpdate(requests);
    return protectedNames;
  }

  private async inspect(): Promise<Inspection> {
    const meta = await this.client.getSpreadsheet<SheetMeta>(META_FIELDS);
    const titles = new Set((meta.sheets ?? []).map((sheet) => sheet.properties?.title ?? ''));
    const present = COLLECTIONS.filter((name) => titles.has(name));
    const ranges = present.map((name) => `${quoteSheet(name)}!1:1`);
    const results = await this.client.batchGet(ranges);
    const headers = new Map<string, Row>();
    present.forEach((name, index) => headers.set(name, results[index]?.values?.[0] ?? []));

    const collections: CollectionStatus[] = COLLECTIONS.map((name) => {
      if (!titles.has(name)) return { name, exists: false, missingFields: columnKeys(SHEET_SCHEMAS[name]), unknownFields: [] };
      const header = indexHeader(headers.get(name) ?? []);
      const expected = columnKeys(SHEET_SCHEMAS[name]);
      const sheet = meta.sheets?.find((candidate) => candidate.properties?.title === name);
      return {
        name,
        exists: true,
        missingFields: expected.filter((key) => !header.has(key)),
        unknownFields: [...header.keys()].filter((key) => !expected.includes(key)),
        recordCount: Math.max(0, (sheet?.properties?.gridProperties?.rowCount ?? 1) - 1) || undefined,
      };
    });
    const knownTitles = new Set<string>(COLLECTIONS);
    return {
      meta,
      headers,
      report: {
        title: meta.properties?.title ?? 'Untitled spreadsheet',
        collections: collections.map(({ recordCount: _ignored, ...rest }) => rest),
        extraCollections: [...titles].filter((title) => title && !knownTitles.has(title)),
        healthy: collections.every((collection) => collection.exists && collection.missingFields.length === 0),
      },
    };
  }

  private async seedSequences() {
    const schema = SHEET_SCHEMAS.sequences;
    const header = indexHeader(columnKeys(schema));
    const rows = SEQUENCE_ENTITIES.map((entity) =>
      documentToRow(
        stampCreate<Sequence & { claimToken: string }>(
          {
            _id: entity,
            prefix: ID_FORMATS[entity].prefix,
            padding: ID_FORMATS[entity].padding,
            lastNumber: 0,
            claimToken: '',
            isActive: true,
          },
          this.audit,
        ),
        header,
        schema,
        schema.columns.length,
      ),
    );
    await this.client.append(`${quoteSheet(schema.name)}!A1`, rows);
  }

  /** Warn (not block) anyone editing a header row by hand. */
  private async protectHeaderRows() {
    const meta = await this.client.getSpreadsheet<SheetMeta>(META_FIELDS);
    const requests = (meta.sheets ?? [])
      .filter(
        (sheet) =>
          COLLECTIONS.includes(sheet.properties?.title as CollectionName) &&
          !sheet.protectedRanges?.some((range) => range.description === HEADER_PROTECTION),
      )
      .map((sheet) => ({
        addProtectedRange: {
          protectedRange: {
            range: { sheetId: sheet.properties?.sheetId, startRowIndex: 0, endRowIndex: 1 },
            description: HEADER_PROTECTION,
            warningOnly: true,
          },
        },
      }));
    if (requests.length) await this.client.batchUpdate(requests);
  }
}

function failure(id: DiagnosticCheck['id'], label: string, error: unknown): DiagnosticCheck {
  const appError = toAppError(error);
  return { id, label, status: 'fail', message: appError.userMessage, details: appError.details };
}
