import type { BillLine } from '../../models/bill';
import type { EntityId, IsoDate } from '../../models/common';
import { addDays, dateRange, isIsoDate } from '../dates';
import { roundMoney, roundPercentage, sumMoney, sumQuantity } from '../money';

/**
 * Sales & profit report built from saved (finalized) bill lines.
 *
 * Profit uses the purchase price frozen into each bill line at save time, so a
 * report for last month stays correct even after product prices change.
 *   sales  = Σ sellingPrice × quantity
 *   cost   = Σ purchasePrice × quantity
 *   profit = sales − cost
 *   margin = profit / sales × 100
 */
export interface ReportMetrics {
  quantity: number;
  sales: number;
  cost: number;
  profit: number;
  /** % of sales. */
  margin: number;
  /** Share of the parent's sales, %. */
  share: number;
}

export interface ProductReportRow extends ReportMetrics {
  productId: EntityId;
  productName: string;
  unit: string;
  /** Average selling rate per unit (sales ÷ quantity). */
  averageRate: number;
  /** Average purchase cost per unit. */
  averageCost: number;
}

export interface CategoryReportRow extends ReportMetrics {
  categoryId: EntityId;
  categoryName: string;
  products: ProductReportRow[];
}

export interface VendorReportRow extends ReportMetrics {
  vendorId: EntityId;
  vendorName: string;
  categories: CategoryReportRow[];
}

export interface DailyReportPoint {
  date: IsoDate;
  sales: number;
  profit: number;
}

export interface ReportPeriod {
  preset: ReportPreset;
  from: IsoDate;
  to: IsoDate;
  label: string;
}

export interface SalesReport {
  period: ReportPeriod;
  generatedAt: string;
  billCount: number;
  totals: ReportMetrics;
  vendors: VendorReportRow[];
  daily: DailyReportPoint[];
}

export const REPORT_PRESETS = ['today', 'week', 'month', 'custom'] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const REPORT_PRESET_LABELS: Record<ReportPreset, string> = {
  today: 'Today',
  week: '1 Week',
  month: '1 Month',
  custom: 'Custom',
};

/** Longest custom range accepted (keeps Sheets reads bounded). */
export const MAX_REPORT_DAYS = 366;

/** Resolves a preset to an inclusive date range ending today. */
export function resolveReportPeriod(
  preset: ReportPreset,
  today: IsoDate,
  custom?: { from: IsoDate; to: IsoDate },
): ReportPeriod {
  switch (preset) {
    case 'today':
      return { preset, from: today, to: today, label: 'Today' };
    case 'week':
      return { preset, from: addDays(today, -6), to: today, label: 'Last 7 days' };
    case 'month':
      return { preset, from: addDays(today, -29), to: today, label: 'Last 30 days' };
    case 'custom': {
      const from = custom?.from ?? today;
      const to = custom?.to ?? today;
      return { preset, from, to, label: 'Custom range' };
    }
  }
}

/** Returns an error message for an invalid custom range, or null. */
export function validateReportRange(from: string, to: string): string | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return 'Choose both a start and an end date.';
  if (from > to) return 'The start date must be on or before the end date.';
  if (dateRange(from, to).length > MAX_REPORT_DAYS) return `Choose a range of at most ${MAX_REPORT_DAYS} days.`;
  return null;
}

interface Accumulator {
  quantity: number[];
  sales: number[];
  cost: number[];
}

const newAccumulator = (): Accumulator => ({ quantity: [], sales: [], cost: [] });

function add(acc: Accumulator, line: BillLine) {
  acc.quantity.push(line.quantity);
  acc.sales.push(line.total);
  acc.cost.push(roundMoney(line.purchasePrice * line.quantity));
}

function metrics(acc: Accumulator, parentSales: number): ReportMetrics {
  const sales = sumMoney(acc.sales);
  const cost = sumMoney(acc.cost);
  const profit = roundMoney(sales - cost);
  return {
    quantity: sumQuantity(acc.quantity),
    sales,
    cost,
    profit,
    margin: sales > 0 ? roundPercentage((profit / sales) * 100) : 0,
    share: parentSales > 0 ? roundPercentage((sales / parentSales) * 100) : 0,
  };
}

const bySalesDesc = <T extends { sales: number }>(a: T, b: T) => b.sales - a.sales;

export function buildSalesReport(lines: readonly BillLine[], period: ReportPeriod, generatedAt: string): SalesReport {
  const total = newAccumulator();
  const vendorAcc = new Map<EntityId, { name: string; acc: Accumulator; categories: Map<EntityId, { name: string; acc: Accumulator; products: Map<EntityId, { name: string; unit: string; acc: Accumulator }> }> }>();
  const daily = new Map<IsoDate, Accumulator>();
  const bills = new Set<EntityId>();

  for (const line of lines) {
    bills.add(line.billId);
    add(total, line);

    let vendor = vendorAcc.get(line.vendorId);
    if (!vendor) {
      vendor = { name: line.vendorName, acc: newAccumulator(), categories: new Map() };
      vendorAcc.set(line.vendorId, vendor);
    }
    add(vendor.acc, line);

    let category = vendor.categories.get(line.categoryId);
    if (!category) {
      category = { name: line.categoryName, acc: newAccumulator(), products: new Map() };
      vendor.categories.set(line.categoryId, category);
    }
    add(category.acc, line);

    let product = category.products.get(line.productId);
    if (!product) {
      product = { name: line.productName, unit: line.unit, acc: newAccumulator() };
      category.products.set(line.productId, product);
    }
    add(product.acc, line);

    const day = daily.get(line.billDate) ?? newAccumulator();
    add(day, line);
    daily.set(line.billDate, day);
  }

  const totals = metrics(total, 0);
  const vendors: VendorReportRow[] = [...vendorAcc.entries()]
    .map(([vendorId, vendor]) => {
      const vendorMetrics = metrics(vendor.acc, totals.sales);
      const categories: CategoryReportRow[] = [...vendor.categories.entries()]
        .map(([categoryId, category]) => {
          const categoryMetrics = metrics(category.acc, vendorMetrics.sales);
          const products: ProductReportRow[] = [...category.products.entries()]
            .map(([productId, product]) => {
              const productMetrics = metrics(product.acc, categoryMetrics.sales);
              return {
                productId,
                productName: product.name,
                unit: product.unit,
                ...productMetrics,
                averageRate: productMetrics.quantity > 0 ? roundMoney(productMetrics.sales / productMetrics.quantity) : 0,
                averageCost: productMetrics.quantity > 0 ? roundMoney(productMetrics.cost / productMetrics.quantity) : 0,
              };
            })
            .sort(bySalesDesc);
          return { categoryId, categoryName: category.name, ...categoryMetrics, products };
        })
        .sort(bySalesDesc);
      return { vendorId, vendorName: vendor.name, ...vendorMetrics, categories };
    })
    .sort(bySalesDesc);

  return {
    period,
    generatedAt,
    billCount: bills.size,
    totals,
    vendors,
    daily: dateRange(period.from, period.to).map((date) => {
      const day = daily.get(date);
      const dayMetrics = day ? metrics(day, 0) : null;
      return { date, sales: dayMetrics?.sales ?? 0, profit: dayMetrics?.profit ?? 0 };
    }),
  };
}
