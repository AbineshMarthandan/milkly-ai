import { AppError } from '../errors/AppError';
import type { BaseEntity, EntityChanges, EntityId } from '../models/common';
import type { SequenceEntity } from '../models/sequence';
import type { Permission } from '../permissions/permissions';
import { assertCan } from '../permissions/permissions';
import type { Repository, SequenceRepository } from '../repositories';
import type { ServiceContext } from './context';
import { ID_FORMATS, formatSequenceId, maxSequenceNumber } from './ids';

/**
 * Behaviour shared by every master-data service: permission checks, ID
 * allocation, and soft delete / reactivation. Records are never physically
 * deleted, so historical bills keep resolving and IDs are never reused.
 */
export abstract class MasterDataService<T extends BaseEntity> {
  protected abstract readonly entity: SequenceEntity;
  protected abstract readonly viewPermission: Permission;
  protected abstract readonly managePermission: Permission;
  /** Singular, human-readable entity name used in messages. */
  protected abstract readonly label: string;

  constructor(
    protected readonly repository: Repository<T>,
    protected readonly sequences: SequenceRepository,
    protected readonly context: ServiceContext,
  ) {}

  async list(): Promise<T[]> {
    assertCan(this.context.getActor(), this.viewPermission);
    return this.repository.getAll();
  }

  async get(id: EntityId): Promise<T> {
    assertCan(this.context.getActor(), this.viewPermission);
    const entity = await this.repository.getById(id);
    if (!entity) throw new AppError('NOT_FOUND', { userMessage: `${this.label} not found.` });
    return entity;
  }

  /** "Delete" in the UI: a soft delete that can be undone with `reactivate`. */
  async deactivate(id: EntityId, expectedVersion?: number): Promise<T> {
    assertCan(this.context.getActor(), this.managePermission);
    return this.repository.update(id, { isActive: false } as EntityChanges<T>, { expectedVersion });
  }

  async reactivate(id: EntityId, expectedVersion?: number): Promise<T> {
    assertCan(this.context.getActor(), this.managePermission);
    await this.beforeReactivate(id);
    return this.repository.update(id, { isActive: true } as EntityChanges<T>, { expectedVersion });
  }

  protected async allocateId(existing: readonly T[]): Promise<EntityId> {
    const format = ID_FORMATS[this.entity];
    const floor = maxSequenceNumber(
      existing.map((entity) => entity._id),
      format,
    );
    return formatSequenceId(format, await this.sequences.next(this.entity, floor));
  }

  protected async requireExisting(id: EntityId): Promise<T> {
    const entity = await this.repository.getById(id);
    if (!entity) throw new AppError('NOT_FOUND', { userMessage: `${this.label} not found. It may have been removed.` });
    return entity;
  }

  /** Hook for parent-state checks before reactivation. */
  protected async beforeReactivate(_id: EntityId): Promise<void> {}
}

export function duplicateError(field: string, message: string): AppError {
  return new AppError('DUPLICATE', { userMessage: message, fieldErrors: { [field]: message } });
}
