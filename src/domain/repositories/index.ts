/**
 * Repository interfaces — the persistence boundary.
 *
 *   React UI → hooks → application services → **these interfaces** → GoogleSheets* | Mongo*
 *
 * Contract shared by every implementation:
 * - `create`/`update`/`delete` stamp audit fields (createdAt/By, updatedAt/By) and
 *   bump `version`, the way Mongoose timestamps do. Callers never set them.
 * - `update` accepts `expectedVersion`; a mismatch throws `CONCURRENT_UPDATE`.
 * - `delete` is a SOFT delete (`isActive: false`). Nothing is ever physically
 *   removed, so historical bills always resolve and IDs are never reused.
 * - IDs are supplied by the caller (allocated from `SequenceRepository`) and never reused.
 */
import type {
  Bill,
  BillHeader,
  BillLine,
  BillStatus,
  Category,
  Customer,
  EntityChanges,
  EntityId,
  EntityInput,
  IsoDate,
  Product,
  Route,
  SequenceEntity,
  SettingsDocument,
  User,
  Vendor,
} from '../models';
import type { BaseEntity } from '../models/common';

export interface UpdateOptions {
  /** Reject the write if the stored document has a different version. */
  expectedVersion?: number;
}

export interface Repository<T extends BaseEntity> {
  getAll(): Promise<T[]>;
  getById(id: EntityId): Promise<T | null>;
  create(entity: EntityInput<T>): Promise<T>;
  update(id: EntityId, changes: EntityChanges<T>, options?: UpdateOptions): Promise<T>;
  /** Soft delete (`isActive: false`). */
  delete(id: EntityId, options?: UpdateOptions): Promise<void>;
}

export type VendorRepository = Repository<Vendor>;
export type CategoryRepository = Repository<Category>;
export type ProductRepository = Repository<Product>;
export type RouteRepository = Repository<Route>;
export type CustomerRepository = Repository<Customer>;

export interface UserRepository extends Repository<User> {
  findByEmail(email: string): Promise<User | null>;
}

export interface BillListQuery {
  /** Inclusive. */
  dateFrom?: IsoDate;
  /** Inclusive. */
  dateTo?: IsoDate;
  statuses?: BillStatus[];
}

export interface BillRepository {
  /** Headers only (no line items), newest first. */
  list(query?: BillListQuery): Promise<BillHeader[]>;
  /** Total number of bills ever saved (any status). */
  count(): Promise<number>;
  /** Full document with the embedded vendor → category → item tree. */
  getById(id: EntityId): Promise<Bill | null>;
  /** Persists a finalized bill. */
  create(bill: EntityInput<Bill>): Promise<Bill>;
  /** Replaces header and line items. */
  update(id: EntityId, bill: EntityChanges<Bill>, options?: UpdateOptions): Promise<Bill>;
  /** Flattened current line items of bills in the query range (for reports). */
  listLines(query: BillListQuery): Promise<BillLine[]>;
}

export interface SettingsRepository {
  get<T>(key: string): Promise<SettingsDocument<T> | null>;
  save<T>(key: string, data: T, options?: UpdateOptions): Promise<SettingsDocument<T>>;
}

export interface SequenceRepository {
  /**
   * Atomically (as far as the engine allows) increments and returns the next
   * number for `entity`. `floor` guarantees the result is greater than it,
   * which self-heals counters that drifted behind existing data.
   */
  next(entity: SequenceEntity, floor?: number): Promise<number>;
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface DiagnosticCheck {
  id: 'auth' | 'database' | 'collections' | 'fields' | 'read' | 'write';
  label: string;
  status: CheckStatus;
  message: string;
  /** Technical detail for Tech Admins. */
  details?: string;
}

export interface CollectionStatus {
  name: string;
  exists: boolean;
  missingFields: string[];
  unknownFields: string[];
  /** Data rows/documents, when cheaply known. */
  recordCount?: number;
}

export interface StructureReport {
  title: string;
  collections: CollectionStatus[];
  extraCollections: string[];
  healthy: boolean;
}

export interface RepairResult {
  createdCollections: string[];
  addedFields: Record<string, string[]>;
}

/** Tech-Admin maintenance operations every data source exposes. */
export interface DatabaseAdministration {
  /** Authentication, access, structure, read and write checks. */
  testConnection(): Promise<DiagnosticCheck[]>;
  inspectStructure(): Promise<StructureReport>;
  /** Creates missing collections/fields. Never deletes or rewrites data. */
  repairStructure(): Promise<RepairResult>;
  /** Restricts editing of `users`/`settings` to the given accounts at the storage level. */
  restrictAdminCollections?(editorEmails: string[]): Promise<string[]>;
  /** Link to open the underlying store (e.g. the spreadsheet), if any. */
  readonly externalUrl?: string;
}

export type DataSourceKind = 'google-sheets' | 'mongodb';

/** A complete persistence implementation. Swap this object to change databases. */
export interface DataSource {
  readonly kind: DataSourceKind;
  /** Human-readable description shown in the UI (never contains secrets). */
  readonly label: string;
  readonly vendors: VendorRepository;
  readonly categories: CategoryRepository;
  readonly products: ProductRepository;
  readonly routes: RouteRepository;
  readonly customers: CustomerRepository;
  readonly bills: BillRepository;
  readonly users: UserRepository;
  readonly settings: SettingsRepository;
  readonly sequences: SequenceRepository;
  readonly admin: DatabaseAdministration;
  /** Drops any internal read caches so the next read hits the store. */
  clearCache(): void;
}
