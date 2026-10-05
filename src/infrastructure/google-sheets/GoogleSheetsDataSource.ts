import type { Category, Customer, GoogleSheetConfig, Product, Route, Sequence, User, Vendor } from '@/domain/models';
import type { DataSource } from '@/domain/repositories';
import type { AuditContext } from '../shared/audit';
import { BatchReader } from './client/BatchReader';
import { SheetsApiClient, type AccessTokenSource } from './client/SheetsApiClient';
import { SheetCollection, type SheetsContext } from './core/SheetCollection';
import { SheetLayout } from './core/SheetLayout';
import { SheetsAdministration } from './diagnostics/SheetsAdministration';
import { GoogleSheetsBillRepository, type BillHeaderRow, type BillLineRow } from './repositories/GoogleSheetsBillRepository';
import {
  GoogleSheetsCategoryRepository,
  GoogleSheetsCustomerRepository,
  GoogleSheetsProductRepository,
  GoogleSheetsRouteRepository,
  GoogleSheetsUserRepository,
  GoogleSheetsVendorRepository,
} from './repositories/GoogleSheetsRepository';
import { GoogleSheetsSequenceRepository } from './repositories/GoogleSheetsSequenceRepository';
import { GoogleSheetsSettingsRepository, type SettingsRow } from './repositories/GoogleSheetsSettingsRepository';
import { SHEET_SCHEMAS, type CollectionName } from './schemas/sheetSchemas';

/** Cache lifetimes. Master data changes rarely; bills change constantly. */
const MASTER_TTL_MS = 30_000;
const BILL_TTL_MS = 10_000;

export interface GoogleSheetsDataSourceOptions {
  config: GoogleSheetConfig;
  tokens: AccessTokenSource;
  audit: AuditContext;
  identityEmail: () => string | null;
}

/** The Google Sheets persistence implementation of `DataSource`. */
export class GoogleSheetsDataSource implements DataSource {
  readonly kind = 'google-sheets' as const;
  readonly label: string;
  readonly vendors;
  readonly categories;
  readonly products;
  readonly routes;
  readonly customers;
  readonly bills;
  readonly users;
  readonly settings;
  readonly sequences;
  readonly admin;

  private readonly collections: SheetCollection<{ _id: string }>[] = [];
  private readonly layout: SheetLayout;

  constructor({ config, tokens, audit, identityEmail }: GoogleSheetsDataSourceOptions) {
    const client = new SheetsApiClient(config.spreadsheetId, tokens);
    const reader = new BatchReader(client);
    this.layout = new SheetLayout(client, reader);
    const ctx: SheetsContext = { client, reader, layout: this.layout };

    const collection = <T extends { _id: string }>(name: CollectionName, ttl = MASTER_TTL_MS) => {
      const instance = new SheetCollection<T>(ctx, SHEET_SCHEMAS[name], ttl);
      this.collections.push(instance as unknown as SheetCollection<{ _id: string }>);
      return instance;
    };

    this.label = 'Google Sheets';
    this.vendors = new GoogleSheetsVendorRepository(collection<Vendor>('vendors'), audit);
    this.categories = new GoogleSheetsCategoryRepository(collection<Category>('categories'), audit);
    this.products = new GoogleSheetsProductRepository(collection<Product>('products'), audit);
    this.routes = new GoogleSheetsRouteRepository(collection<Route>('routes'), audit);
    this.customers = new GoogleSheetsCustomerRepository(collection<Customer>('customers'), audit);
    this.users = new GoogleSheetsUserRepository(collection<User>('users'), audit);
    this.bills = new GoogleSheetsBillRepository(
      collection<BillHeaderRow>('bills', BILL_TTL_MS),
      collection<BillLineRow>('bill_items', BILL_TTL_MS),
      audit,
    );
    this.settings = new GoogleSheetsSettingsRepository(collection<SettingsRow>('settings'), audit);
    this.sequences = new GoogleSheetsSequenceRepository(collection<Sequence & { claimToken: string }>('sequences', 0), audit);
    this.admin = new SheetsAdministration(client, tokens, this.layout, this.settings, audit, identityEmail);
  }

  clearCache(): void {
    for (const collection of this.collections) collection.invalidate();
    this.layout.invalidate();
  }
}
