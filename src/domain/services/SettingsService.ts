import { AppError } from '../errors/AppError';
import {
  DEFAULT_APP_SETTINGS,
  SETTINGS_KEYS,
  type AppSettings,
  type DatabaseMetadata,
  type SettingsDocument,
} from '../models/settings';
import { assertCan } from '../permissions/permissions';
import type { SettingsRepository } from '../repositories';
import { appSettingsSchema, parseOrThrow, type AppSettingsFormValues } from '../validation/schemas';
import type { ServiceContext } from './context';

export interface VersionedSettings<T> {
  data: T;
  version: number | undefined;
  updatedAt?: string;
}

export class SettingsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly context: ServiceContext,
  ) {}

  /** Readable by every signed-in user (business name/address are printed on bills). */
  async getAppSettings(): Promise<VersionedSettings<AppSettings>> {
    if (!this.context.getActor()) throw new AppError('AUTH_REQUIRED');
    const document = await this.settings.get<Partial<AppSettings>>(SETTINGS_KEYS.app);
    return {
      data: { ...DEFAULT_APP_SETTINGS, ...(document?.data ?? {}) },
      version: document?.version,
      updatedAt: document?.updatedAt,
    };
  }

  async saveAppSettings(input: AppSettingsFormValues, expectedVersion?: number): Promise<SettingsDocument<AppSettings>> {
    assertCan(this.context.getActor(), 'settings:app:manage');
    const values = parseOrThrow(appSettingsSchema, input);
    return this.settings.save<AppSettings>(SETTINGS_KEYS.app, values, { expectedVersion });
  }

  async getDatabaseMetadata(): Promise<DatabaseMetadata | null> {
    assertCan(this.context.getActor(), 'settings:sheets:manage');
    return (await this.settings.get<DatabaseMetadata>(SETTINGS_KEYS.database))?.data ?? null;
  }
}
