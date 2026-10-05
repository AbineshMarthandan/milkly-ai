import type { BaseEntity, SettingsDocument } from '@/domain/models';
import type { SettingsRepository, UpdateOptions } from '@/domain/repositories';
import { stampCreate, stampUpdate, type AuditContext } from '../../shared/audit';
import type { SheetCollection } from '../core/SheetCollection';

export type SettingsRow = BaseEntity & { data: unknown };

const toDocument = <T>(row: SettingsRow): SettingsDocument<T> => ({
  _id: row._id,
  data: row.data as T,
  version: row.version,
  createdAt: row.createdAt,
  createdBy: row.createdBy,
  updatedAt: row.updatedAt,
  updatedBy: row.updatedBy,
});

/** One row per settings document; `data` holds the document body as JSON. */
export class GoogleSheetsSettingsRepository implements SettingsRepository {
  constructor(
    private readonly collection: SheetCollection<SettingsRow>,
    private readonly audit: AuditContext,
  ) {}

  async get<T>(key: string): Promise<SettingsDocument<T> | null> {
    const row = await this.collection.findById(key);
    return row ? toDocument<T>(row) : null;
  }

  async save<T>(key: string, data: T, options: UpdateOptions = {}): Promise<SettingsDocument<T>> {
    const located = await this.collection.locate(key);
    if (!located) {
      const { doc } = await this.collection.insert(stampCreate<SettingsRow>({ _id: key, data, isActive: true }, this.audit));
      return toDocument<T>(doc);
    }
    const row = await this.collection.replace(key, (current) => stampUpdate(current, { data }, this.audit), options);
    return toDocument<T>(row);
  }
}
