import type { Identity } from '../auth/identity';
import { AppError } from '../errors/AppError';
import type { Actor, User } from '../models';
import { DEFAULT_APP_SETTINGS, SETTINGS_KEYS, type DatabaseMetadata } from '../models/settings';
import type { DataSource } from '../repositories';
import { ID_FORMATS, formatSequenceId } from './ids';

/**
 * First-run initialisation of an empty database: the person who initialises
 * it becomes the first Tech Admin. Refuses to run once any user exists, so it
 * cannot be used to escalate privileges on a live database.
 */
export class BootstrapService {
  constructor(
    private readonly dataSource: DataSource,
    /** Lets audit stamps carry the new admin's ID before a session exists. */
    private readonly setActor: (actor: Actor) => void,
  ) {}

  async initialize(identity: Identity, schemaVersion: number): Promise<User> {
    if ((await this.dataSource.users.getAll()).length > 0) {
      throw new AppError('VALIDATION', { userMessage: 'This database already has users. Sign in instead.' });
    }
    const _id = formatSequenceId(ID_FORMATS.user, await this.dataSource.sequences.next('user', 0));
    const actor: Actor = { userId: _id, email: identity.email, displayName: identity.name || identity.email, role: 'TECH_ADMIN' };
    this.setActor(actor);

    const user = await this.dataSource.users.create({
      _id,
      email: identity.email.toLowerCase(),
      displayName: actor.displayName,
      role: 'TECH_ADMIN',
      lastLoginAt: new Date().toISOString(),
      isActive: true,
    });
    if (!(await this.dataSource.settings.get(SETTINGS_KEYS.app))) {
      await this.dataSource.settings.save(SETTINGS_KEYS.app, DEFAULT_APP_SETTINGS);
    }
    const metadata: DatabaseMetadata = { schemaVersion, initializedAt: new Date().toISOString(), initializedBy: _id };
    await this.dataSource.settings.save(SETTINGS_KEYS.database, metadata);
    return user;
  }
}
