import { AppError } from '@/domain/errors/AppError';
import type { BaseEntity, Category, Customer, EntityChanges, EntityId, EntityInput, Product, Route, User, Vendor } from '@/domain/models';
import type { Repository, UpdateOptions, UserRepository } from '@/domain/repositories';
import { stampCreate, stampUpdate, type AuditContext } from '../../shared/audit';
import type { SheetCollection } from '../core/SheetCollection';

/** Generic master-data repository over one tab. */
export class GoogleSheetsRepository<T extends BaseEntity> implements Repository<T> {
  constructor(
    protected readonly collection: SheetCollection<T>,
    protected readonly audit: AuditContext,
  ) {}

  getAll(): Promise<T[]> {
    return this.collection.findAll();
  }

  getById(id: EntityId): Promise<T | null> {
    return this.collection.findById(id);
  }

  async create(input: EntityInput<T>): Promise<T> {
    const { doc } = await this.collection.insert(stampCreate<T>(input, this.audit));
    return doc;
  }

  update(id: EntityId, changes: EntityChanges<T>, options: UpdateOptions = {}): Promise<T> {
    return this.collection.replace(id, (current) => stampUpdate(current, changes, this.audit), options);
  }

  /** Soft delete: rows are never physically removed. */
  async delete(id: EntityId, options: UpdateOptions = {}): Promise<void> {
    await this.update(id, { isActive: false } as EntityChanges<T>, options);
  }
}

export class GoogleSheetsVendorRepository extends GoogleSheetsRepository<Vendor> {}
export class GoogleSheetsCategoryRepository extends GoogleSheetsRepository<Category> {}
export class GoogleSheetsProductRepository extends GoogleSheetsRepository<Product> {}
export class GoogleSheetsRouteRepository extends GoogleSheetsRepository<Route> {}
export class GoogleSheetsCustomerRepository extends GoogleSheetsRepository<Customer> {}

export class GoogleSheetsUserRepository extends GoogleSheetsRepository<User> implements UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const target = email.trim().toLowerCase();
    const users = await this.collection.findAll({ fresh: true });
    return users.find((user) => user.email.trim().toLowerCase() === target) ?? null;
  }

  async create(input: EntityInput<User>): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.collection.findAll({ fresh: true });
    if (existing.some((user) => user.email.toLowerCase() === email)) {
      throw new AppError('DUPLICATE', { userMessage: `${email} is already registered.` });
    }
    return super.create({ ...input, email });
  }
}
