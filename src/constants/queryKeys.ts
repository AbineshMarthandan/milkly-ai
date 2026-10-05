import type { BillListQuery } from '@/domain/repositories';
import type { ReportPeriod } from '@/domain/services';

/** Central React Query keys, so invalidation after writes is consistent. */
export const queryKeys = {
  vendors: ['vendors'] as const,
  categories: ['categories'] as const,
  products: ['products'] as const,
  routes: ['routes'] as const,
  customers: ['customers'] as const,
  users: ['users'] as const,
  userDirectory: ['users', 'directory'] as const,
  appSettings: ['settings', 'app'] as const,
  databaseMeta: ['settings', 'database'] as const,
  bills: ['bills'] as const,
  billList: (query: BillListQuery) => ['bills', 'list', query] as const,
  bill: (id: string) => ['bills', 'detail', id] as const,
  dashboard: ['dashboard'] as const,
  dashboardMasters: ['dashboard', 'masters'] as const,
  dashboardBills: (today: string) => ['dashboard', 'bills', today] as const,
  dashboardProducts: (today: string) => ['dashboard', 'products', today] as const,
  report: (period: Pick<ReportPeriod, 'from' | 'to'>) => ['reports', 'sales', period.from, period.to] as const,
};
