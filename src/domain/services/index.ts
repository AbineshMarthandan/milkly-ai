import type { IsoDate } from '../models';
import type { DataSource } from '../repositories';
import { BillService } from './BillService';
import { CategoryService } from './CategoryService';
import type { ServiceContext } from './context';
import { CustomerService } from './CustomerService';
import { DashboardService } from './DashboardService';
import { ProductService } from './ProductService';
import { ReportService } from './ReportService';
import { RouteService } from './RouteService';
import { SettingsService } from './SettingsService';
import { UserService } from './UserService';
import { VendorService } from './VendorService';

export type { ServiceContext } from './context';
export * from './BillService';
export * from './DashboardService';
export * from './UserService';
export * from './SettingsService';
export * from './BootstrapService';
export * from './ReportService';
export * from './reports/salesReport';

/** The application-service layer, wired to one data source. */
export interface AppServices {
  vendors: VendorService;
  categories: CategoryService;
  products: ProductService;
  routes: RouteService;
  customers: CustomerService;
  bills: BillService;
  users: UserService;
  settings: SettingsService;
  dashboard: DashboardService;
  reports: ReportService;
}

export interface ServiceOptions {
  /** The current business day (defaults to the device's local date); injectable for tests. */
  today?: () => IsoDate;
}

export function createServices(ds: DataSource, context: ServiceContext, options: ServiceOptions = {}): AppServices {
  return {
    vendors: new VendorService(ds.vendors, ds.sequences, context),
    categories: new CategoryService(ds.categories, ds.sequences, context, ds.vendors, ds.products),
    products: new ProductService(ds.products, ds.sequences, context, ds.vendors, ds.categories),
    routes: new RouteService(ds.routes, ds.sequences, context),
    customers: new CustomerService(ds.customers, ds.sequences, context, ds.routes, ds.vendors),
    bills: new BillService(
      ds.bills,
      ds.sequences,
      ds.routes,
      ds.customers,
      context,
      { vendors: ds.vendors, categories: ds.categories, products: ds.products },
      options.today,
    ),
    users: new UserService(ds.users, ds.sequences, context),
    settings: new SettingsService(ds.settings, context),
    dashboard: new DashboardService(ds, ds.bills, context),
    reports: new ReportService(ds.bills, context),
  };
}
