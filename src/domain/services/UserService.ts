import type { Identity } from '../auth/identity';
import { AppError } from '../errors/AppError';
import type { EntityId, User } from '../models';
import { assertCan } from '../permissions/permissions';
import type { SequenceRepository, UserRepository } from '../repositories';
import { parseOrThrow, userFormSchema, type UserFormValues } from '../validation/schemas';
import type { ServiceContext } from './context';
import { duplicateError } from './MasterDataService';
import { ID_FORMATS, formatSequenceId, maxSequenceNumber } from './ids';

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly sequences: SequenceRepository,
    private readonly context: ServiceContext,
  ) {}

  async list(): Promise<User[]> {
    assertCan(this.context.getActor(), 'user:manage');
    return this.users.getAll();
  }

  /** Display names for audit columns ("Created by"); readable by every role. */
  async directory(): Promise<Map<EntityId, string>> {
    if (!this.context.getActor()) throw new AppError('AUTH_REQUIRED');
    const users = await this.users.getAll();
    return new Map(users.map((user) => [user._id, user.displayName]));
  }

  async create(input: UserFormValues): Promise<User> {
    assertCan(this.context.getActor(), 'user:manage');
    const values = parseOrThrow(userFormSchema, input);
    const existing = await this.users.getAll();
    this.assertUniqueEmail(existing, values.email);
    const floor = maxSequenceNumber(
      existing.map((user) => user._id),
      ID_FORMATS.user,
    );
    const _id = formatSequenceId(ID_FORMATS.user, await this.sequences.next('user', floor));
    return this.users.create({ _id, ...values, lastLoginAt: null, isActive: true });
  }

  async update(id: EntityId, input: UserFormValues, expectedVersion?: number): Promise<User> {
    const actor = this.context.getActor();
    assertCan(actor, 'user:manage');
    const values = parseOrThrow(userFormSchema, input);
    const existing = await this.users.getAll();
    const current = existing.find((user) => user._id === id);
    if (!current) throw new AppError('NOT_FOUND', { userMessage: 'User not found.' });
    this.assertUniqueEmail(existing, values.email, id);
    if (current.role === 'TECH_ADMIN' && values.role !== 'TECH_ADMIN') this.assertAnotherTechAdmin(existing, id);
    if (id === actor.userId && values.email !== current.email) {
      throw new AppError('VALIDATION', {
        userMessage: 'You cannot change your own sign-in e-mail.',
        fieldErrors: { email: 'Cannot change your own e-mail' },
      });
    }
    return this.users.update(id, values, { expectedVersion });
  }

  async deactivate(id: EntityId, expectedVersion?: number): Promise<User> {
    const actor = this.context.getActor();
    assertCan(actor, 'user:manage');
    if (id === actor.userId) throw new AppError('VALIDATION', { userMessage: 'You cannot deactivate your own account.' });
    const existing = await this.users.getAll();
    const target = existing.find((user) => user._id === id);
    if (target?.role === 'TECH_ADMIN') this.assertAnotherTechAdmin(existing, id);
    return this.users.update(id, { isActive: false }, { expectedVersion });
  }

  async reactivate(id: EntityId, expectedVersion?: number): Promise<User> {
    assertCan(this.context.getActor(), 'user:manage');
    return this.users.update(id, { isActive: true }, { expectedVersion });
  }

  private assertUniqueEmail(existing: readonly User[], email: string, ignoreId?: EntityId) {
    const clash = existing.find((user) => user._id !== ignoreId && user.email === email.toLowerCase());
    if (clash) throw duplicateError('email', `${email} is already registered (${clash.displayName}).`);
  }

  private assertAnotherTechAdmin(existing: readonly User[], excludingId: EntityId) {
    const others = existing.filter((user) => user._id !== excludingId && user.isActive && user.role === 'TECH_ADMIN');
    if (!others.length) {
      throw new AppError('VALIDATION', { userMessage: 'At least one active Tech Admin is required.' });
    }
  }
}

/** Maps a verified identity to an application user. Runs before an actor exists. */
export class SessionService {
  constructor(private readonly users: UserRepository) {}

  async resolveUser(identity: Identity): Promise<User> {
    const user = await this.users.findByEmail(identity.email);
    if (!user) throw new AppError('USER_NOT_REGISTERED', { details: identity.email });
    if (!user.isActive) throw new AppError('USER_DEACTIVATED', { details: identity.email });
    return user;
  }

  /** Best effort — a failed write must never block sign-in. */
  async recordLogin(user: User): Promise<void> {
    try {
      await this.users.update(user._id, { lastLoginAt: new Date().toISOString() });
    } catch {
      /* ignored */
    }
  }

  async hasAnyUser(): Promise<boolean> {
    return (await this.users.getAll()).length > 0;
  }
}
