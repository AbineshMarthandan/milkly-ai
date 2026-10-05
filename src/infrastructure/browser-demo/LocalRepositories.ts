import { AppError } from '@/domain/errors/AppError';
import type {
  BaseEntity,
  Bill,
  BillHeader,
  EntityChanges,
  EntityId,
  EntityInput,
  Sequence,
  SequenceEntity,
  SettingsDocument,
  User,
} from '@/domain/models';
import type {
  BillListQuery,
  BillRepository,
  Repository,
  SequenceRepository,
  SettingsRepository,
  UpdateOptions,
  UserRepository,
} from '@/domain/repositories';
import { flattenBill } from '@/domain/services/billing/billDocument';
import { ID_FORMATS } from '@/domain/services/ids';
import { sleep } from '../shared/async';
import { stampCreate, stampUpdate, type AuditContext } from '../shared/audit';
import type { LocalDatabase } from './LocalDatabase';

/** Simulated network latency so loading states are visible in demo mode. */
const latency = () => sleep(80 + Math.random() * 160);
const clone = <T>(value: T): T => structuredClone(value);

function assertVersion(entity: BaseEntity, options: UpdateOptions) {
  if (options.expectedVersion !== undefined && entity.version !== options.expectedVersion) {
    throw new AppError('CONCURRENT_UPDATE', { details: `${entity._id}: expected v${options.expectedVersion}, found v${entity.version}` });
  }
}

export class LocalRepository<T extends BaseEntity> implements Repository<T> {
  constructor(
    protected readonly db: LocalDatabase,
    protected readonly name: string,
    protected readonly audit: AuditContext,
  ) {}

  protected get items(): T[] {
    return this.db.collection<T>(this.name);
  }

  async getAll(): Promise<T[]> {
    await latency();
    return clone(this.items);
  }

  async getById(id: EntityId): Promise<T | null> {
    await latency();
    const found = this.items.find((item) => item._id === id);
    return found ? clone(found) : null;
  }

  async create(input: EntityInput<T>): Promise<T> {
    await latency();
    if (this.items.some((item) => item._id === input._id)) throw new AppError('DUPLICATE', { details: `${this.name}/${input._id}` });
    const doc = stampCreate<T>(input, this.audit);
    this.items.push(doc);
    this.db.persist();
    return clone(doc);
  }

  async update(id: EntityId, changes: EntityChanges<T>, options: UpdateOptions = {}): Promise<T> {
    await latency();
    const index = this.items.findIndex((item) => item._id === id);
    if (index === -1) throw new AppError('NOT_FOUND', { details: `${this.name}/${id}` });
    assertVersion(this.items[index], options);
    const next = stampUpdate(this.items[index], changes, this.audit);
    this.items[index] = next;
    this.db.persist();
    return clone(next);
  }

  async delete(id: EntityId, options: UpdateOptions = {}): Promise<void> {
    await this.update(id, { isActive: false } as EntityChanges<T>, options);
  }
}

export class LocalUserRepository extends LocalRepository<User> implements UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    await latency();
    const found = this.items.find((user) => user.email.toLowerCase() === email.trim().toLowerCase());
    return found ? clone(found) : null;
  }
}

/** Stores bills as full embedded documents — exactly what a MongoDB collection would hold. */
export class LocalBillRepository implements BillRepository {
  constructor(
    private readonly db: LocalDatabase,
    private readonly audit: AuditContext,
  ) {}

  private get bills(): Bill[] {
    return this.db.collection<Bill>('bills');
  }

  private matching(query: BillListQuery): Bill[] {
    return this.bills
      .filter(
        (bill) =>
          (!query.dateFrom || bill.billDate >= query.dateFrom) &&
          (!query.dateTo || bill.billDate <= query.dateTo) &&
          (!query.statuses?.length || query.statuses.includes(bill.status)),
      )
      .sort((a, b) => b.billDate.localeCompare(a.billDate) || b.billNumber.localeCompare(a.billNumber));
  }

  async list(query: BillListQuery = {}): Promise<BillHeader[]> {
    await latency();
    return this.matching(query).map(({ vendors: _vendors, ...header }) => clone(header));
  }

  async count(): Promise<number> {
    await latency();
    return this.bills.length;
  }

  async getById(id: EntityId): Promise<Bill | null> {
    await latency();
    const bill = this.bills.find((candidate) => candidate._id === id);
    return bill ? clone(bill) : null;
  }

  async create(input: EntityInput<Bill>): Promise<Bill> {
    await latency();
    if (this.bills.some((bill) => bill._id === input._id)) throw new AppError('DUPLICATE', { details: `bills/${input._id}` });
    const bill = stampCreate<Bill>(input, this.audit);
    this.bills.push(bill);
    this.db.persist();
    return clone(bill);
  }

  async update(id: EntityId, changes: EntityChanges<Bill>, options: UpdateOptions = {}): Promise<Bill> {
    await latency();
    const index = this.bills.findIndex((bill) => bill._id === id);
    if (index === -1) throw new AppError('NOT_FOUND', { userMessage: 'Bill not found.' });
    assertVersion(this.bills[index], options);
    const next = stampUpdate(this.bills[index], changes, this.audit);
    this.bills[index] = next;
    this.db.persist();
    return clone(next);
  }

  async listLines(query: BillListQuery) {
    await latency();
    return this.matching(query).flatMap((bill) => flattenBill(bill));
  }
}

export class LocalSettingsRepository implements SettingsRepository {
  constructor(
    private readonly db: LocalDatabase,
    private readonly audit: AuditContext,
  ) {}

  private get docs(): SettingsDocument<unknown>[] {
    return this.db.collection<SettingsDocument<unknown>>('settings');
  }

  async get<T>(key: string): Promise<SettingsDocument<T> | null> {
    await latency();
    const found = this.docs.find((doc) => doc._id === key);
    return found ? (clone(found) as SettingsDocument<T>) : null;
  }

  async save<T>(key: string, data: T, options: UpdateOptions = {}): Promise<SettingsDocument<T>> {
    await latency();
    const now = this.audit.now();
    const actor = this.audit.actorId();
    const index = this.docs.findIndex((doc) => doc._id === key);
    if (index === -1) {
      const doc: SettingsDocument<T> = { _id: key, data, version: 1, createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor };
      this.docs.push(doc);
      this.db.persist();
      return clone(doc);
    }
    const current = this.docs[index];
    if (options.expectedVersion !== undefined && current.version !== options.expectedVersion) {
      throw new AppError('CONCURRENT_UPDATE', { details: `settings/${key}` });
    }
    const next: SettingsDocument<T> = { ...current, data, version: current.version + 1, updatedAt: now, updatedBy: actor };
    this.docs[index] = next;
    this.db.persist();
    return clone(next);
  }
}

/** Single-tab counters; a real `$inc` would be atomic in MongoDB. */
export class LocalSequenceRepository implements SequenceRepository {
  constructor(
    private readonly db: LocalDatabase,
    private readonly audit: AuditContext,
  ) {}

  async next(entity: SequenceEntity, floor = 0): Promise<number> {
    await latency();
    const counters = this.db.collection<Sequence>('sequences');
    let counter = counters.find((candidate) => candidate._id === entity);
    if (!counter) {
      counter = stampCreate<Sequence>(
        { _id: entity, prefix: ID_FORMATS[entity].prefix, padding: ID_FORMATS[entity].padding, lastNumber: 0, isActive: true },
        this.audit,
      );
      counters.push(counter);
    }
    const value = Math.max(counter.lastNumber, floor) + 1;
    Object.assign(counter, stampUpdate(counter, { lastNumber: value }, this.audit));
    this.db.persist();
    return value;
  }
}
