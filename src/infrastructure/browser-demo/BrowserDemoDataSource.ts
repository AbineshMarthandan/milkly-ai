import type { Identity, IdentityProvider } from '@/domain/auth/identity';
import { AppError } from '@/domain/errors/AppError';
import type { Category, Customer, Product, Route, Vendor } from '@/domain/models';
import type { DataSource, DatabaseAdministration, DiagnosticCheck, StructureReport } from '@/domain/repositories';
import type { AuditContext } from '../shared/audit';
import { COLLECTIONS } from '../google-sheets/schemas/sheetSchemas';
import { LocalDatabase } from './LocalDatabase';
import {
  LocalBillRepository,
  LocalRepository,
  LocalSequenceRepository,
  LocalSettingsRepository,
  LocalUserRepository,
} from './LocalRepositories';
import { DEMO_USERS, createDemoSeed } from './seed';

/**
 * Demo persistence: the same repository interfaces backed by this browser's
 * localStorage. Lets anyone try the app without a Google project, and proves
 * the UI and services are independent of Google Sheets.
 */
export class BrowserDemoDataSource implements DataSource {
  readonly kind = 'browser-demo' as const;
  readonly label = 'Demo data (this browser only)';
  readonly vendors;
  readonly categories;
  readonly products;
  readonly routes;
  readonly customers;
  readonly bills;
  readonly users;
  readonly settings;
  readonly sequences;
  readonly admin: DatabaseAdministration;
  private readonly db: LocalDatabase;

  constructor(audit: AuditContext) {
    this.db = new LocalDatabase(createDemoSeed);
    this.vendors = new LocalRepository<Vendor>(this.db, 'vendors', audit);
    this.categories = new LocalRepository<Category>(this.db, 'categories', audit);
    this.products = new LocalRepository<Product>(this.db, 'products', audit);
    this.routes = new LocalRepository<Route>(this.db, 'routes', audit);
    this.customers = new LocalRepository<Customer>(this.db, 'customers', audit);
    this.users = new LocalUserRepository(this.db, 'users', audit);
    this.bills = new LocalBillRepository(this.db, audit);
    this.settings = new LocalSettingsRepository(this.db, audit);
    this.sequences = new LocalSequenceRepository(this.db, audit);
    this.admin = {
      testConnection: async (): Promise<DiagnosticCheck[]> => [
        { id: 'auth', label: 'Authentication', status: 'pass', message: 'Demo sign-in (no Google account).' },
        { id: 'database', label: 'Database access', status: 'pass', message: 'Browser storage is available.' },
        { id: 'collections', label: 'Collections', status: 'pass', message: 'All demo collections exist.' },
        { id: 'fields', label: 'Fields', status: 'pass', message: 'Documents are stored as-is.' },
        { id: 'read', label: 'Read permission', status: 'pass', message: 'Data can be read.' },
        { id: 'write', label: 'Write permission', status: 'pass', message: 'Data can be written.' },
      ],
      inspectStructure: async (): Promise<StructureReport> => ({
        title: 'Demo database',
        collections: COLLECTIONS.filter((name) => name !== 'bill_items').map((name) => ({
          name,
          exists: true,
          missingFields: [],
          unknownFields: [],
        })),
        extraCollections: [],
        healthy: true,
      }),
      repairStructure: async () => ({ createdCollections: [], addedFields: {} }),
    };
  }

  clearCache(): void {
    /* reads are always from memory */
  }

  /** Restores the original sample data. */
  reset(): void {
    this.db.reset();
  }
}

/** Lets a visitor pick one of the seeded demo users (one per role). */
export class DemoIdentityProvider implements IdentityProvider {
  readonly kind = 'demo' as const;

  async signIn(options: { loginHint?: string } = {}): Promise<Identity> {
    const user = DEMO_USERS.find((candidate) => candidate.email === options.loginHint);
    if (!user) throw new AppError('AUTH_FAILED', { userMessage: 'Choose one of the demo users.' });
    return { email: user.email, name: user.displayName };
  }

  async reauthenticate(): Promise<void> {}

  async signOut(): Promise<void> {}
}
