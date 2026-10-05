import type { BaseEntity, BillHeader, EntityId, IsoDate } from '../models';
import { assertCan } from '../permissions/permissions';
import type { BillRepository, DataSource } from '../repositories';
import type { ServiceContext } from './context';
import { addDays, dateRange, minDate, startOfMonth } from './dates';
import { sumMoney, sumQuantity } from './money';

export interface EntityCount {
  active: number;
  total: number;
}

export interface MasterCounts {
  vendors: EntityCount;
  categories: EntityCount;
  products: EntityCount;
  routes: EntityCount;
  customers: EntityCount;
}

export interface DailySales {
  date: IsoDate;
  count: number;
  total: number;
}

export interface RankedAmount {
  id: EntityId;
  name: string;
  detail?: string;
  quantity?: number;
  total: number;
}

export interface BillStats {
  todayCount: number;
  todaySales: number;
  monthCount: number;
  monthSales: number;
  totalBills: number;
  daily: DailySales[];
  topVendors: RankedAmount[];
  recent: BillHeader[];
}

const SERIES_DAYS = 14;
const count = (items: readonly BaseEntity[]): EntityCount => ({
  active: items.filter((item) => item.isActive).length,
  total: items.length,
});

/**
 * Dashboard figures. Bill statistics only read bill *headers* for the current
 * month (never line items), and master counts reuse the cached collections.
 */
export class DashboardService {
  constructor(
    private readonly dataSource: Pick<DataSource, 'vendors' | 'categories' | 'products' | 'routes' | 'customers'>,
    private readonly bills: BillRepository,
    private readonly context: ServiceContext,
  ) {}

  async getMasterCounts(): Promise<MasterCounts> {
    assertCan(this.context.getActor(), 'dashboard:view');
    const [vendors, categories, products, routes, customers] = await Promise.all([
      this.dataSource.vendors.getAll(),
      this.dataSource.categories.getAll(),
      this.dataSource.products.getAll(),
      this.dataSource.routes.getAll(),
      this.dataSource.customers.getAll(),
    ]);
    return {
      vendors: count(vendors),
      categories: count(categories),
      products: count(products),
      routes: count(routes),
      customers: count(customers),
    };
  }

  async getBillStats(today: IsoDate): Promise<BillStats> {
    assertCan(this.context.getActor(), 'dashboard:view');
    const monthStart = startOfMonth(today);
    const seriesStart = addDays(today, -(SERIES_DAYS - 1));
    const [headers, totalBills] = await Promise.all([
      this.bills.list({ dateFrom: minDate(monthStart, seriesStart), dateTo: today, statuses: ['finalized'] }),
      this.bills.count(),
    ]);

    const todays = headers.filter((bill) => bill.billDate === today);
    const month = headers.filter((bill) => bill.billDate >= monthStart);

    const byDate = new Map<IsoDate, BillHeader[]>();
    for (const bill of headers) byDate.set(bill.billDate, [...(byDate.get(bill.billDate) ?? []), bill]);
    const daily = dateRange(seriesStart, today).map((date) => {
      const bills = byDate.get(date) ?? [];
      return { date, count: bills.length, total: sumMoney(bills.map((bill) => bill.grandTotal)) };
    });

    const vendorTotals = new Map<EntityId, RankedAmount>();
    for (const bill of month) {
      for (const vendor of bill.vendorSummary) {
        const entry = vendorTotals.get(vendor.vendorId) ?? { id: vendor.vendorId, name: vendor.vendorName, total: 0 };
        entry.total = sumMoney([entry.total, vendor.total]);
        vendorTotals.set(vendor.vendorId, entry);
      }
    }

    return {
      todayCount: todays.length,
      todaySales: sumMoney(todays.map((bill) => bill.grandTotal)),
      monthCount: month.length,
      monthSales: sumMoney(month.map((bill) => bill.grandTotal)),
      totalBills,
      daily,
      topVendors: [...vendorTotals.values()].sort((a, b) => b.total - a.total).slice(0, 5),
      recent: [...headers]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    };
  }

  /** Best-selling products this month (reads only this month's line items). */
  async getTopProducts(today: IsoDate, limit = 5): Promise<RankedAmount[]> {
    assertCan(this.context.getActor(), 'dashboard:view');
    const lines = await this.bills.listLines({ dateFrom: startOfMonth(today), dateTo: today, statuses: ['finalized'] });
    const totals = new Map<EntityId, RankedAmount>();
    for (const line of lines) {
      const entry = totals.get(line.productId) ?? {
        id: line.productId,
        name: line.productName,
        detail: `${line.vendorName} · ${line.unit}`,
        quantity: 0,
        total: 0,
      };
      entry.quantity = sumQuantity([entry.quantity ?? 0, line.quantity]);
      entry.total = sumMoney([entry.total, line.total]);
      totals.set(line.productId, entry);
    }
    return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, limit);
  }
}
