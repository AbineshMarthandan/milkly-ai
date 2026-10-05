import { describe, expect, it } from 'vitest';
import { can, ROLE_PERMISSIONS } from '../permissions/permissions';
import { addDays, dateRange, isIsoDate, startOfMonth } from './dates';
import { BILL_NUMBER_FORMAT, ID_FORMATS, formatSequenceId, maxSequenceNumber, parseSequenceNumber } from './ids';
import { sumMoney } from './money';
import { buildSalesReport, resolveReportPeriod, validateReportRange } from './reports/salesReport';
import type { BillLine } from '../models';

describe('sequential IDs', () => {
  it('formats and parses business IDs', () => {
    expect(formatSequenceId(ID_FORMATS.vendor, 1)).toBe('MLVID000001');
    expect(formatSequenceId(ID_FORMATS.customer, 103)).toBe('MLCID000103');
    expect(formatSequenceId(BILL_NUMBER_FORMAT, 1205)).toBe('MLB001205');
    expect(parseSequenceNumber('MLPID000456', ID_FORMATS.product)).toBe(456);
    expect(parseSequenceNumber('MLVID00A', ID_FORMATS.vendor)).toBeNull();
  });

  it('finds the highest number in use so counters self-heal', () => {
    expect(maxSequenceNumber(['MLVID000002', 'MLVID000010', 'junk'], ID_FORMATS.vendor)).toBe(10);
  });

  it('rejects invalid numbers', () => {
    expect(() => formatSequenceId(ID_FORMATS.vendor, 0)).toThrow();
  });
});

describe('permission matrix', () => {
  it('reserves configuration and users for Tech Admin', () => {
    for (const permission of ['settings:sheets:manage', 'settings:app:manage', 'user:manage'] as const) {
      expect(can('TECH_ADMIN', permission)).toBe(true);
      expect(can('SUPER_ADMIN', permission)).toBe(false);
      expect(can('ADMIN', permission)).toBe(false);
    }
  });

  it('lets Super Admin manage masters and bills', () => {
    expect(can('SUPER_ADMIN', 'vendor:manage')).toBe(true);
    expect(can('SUPER_ADMIN', 'bill:cancel')).toBe(true);
    expect(can('SUPER_ADMIN', 'report:view')).toBe(true);
  });

  it('keeps Admin to viewing masters plus creating/printing/viewing bills', () => {
    expect([...ROLE_PERMISSIONS.ADMIN].sort()).toEqual(
      ['bill:create', 'bill:print', 'bill:view', 'category:view', 'customer:view', 'dashboard:view', 'product:view', 'route:view', 'vendor:view'].sort(),
    );
    expect(can(null, 'bill:view')).toBe(false);
  });
});

describe('dates and money', () => {
  it('does calendar arithmetic on ISO dates', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(startOfMonth('2026-10-05')).toBe('2026-10-01');
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(isIsoDate('2026-02-30')).toBe(false);
  });

  it('sums money in minor units', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });
});

describe('sales report', () => {
  const line = (overrides: Partial<BillLine>): BillLine => ({
    billId: 'B1', billNumber: 'MLB000001', billDate: '2026-10-05', itemsRevision: 'r', lineNo: 1,
    vendorId: 'V1', vendorName: 'Aavin', vendorPriority: 1, categoryId: 'C1', categoryName: 'Milk', categoryPriority: 1,
    productId: 'P1', productName: 'Milk', unit: '1 L', purchasePrice: 38, mrp: 40, sellingPrice: 39,
    discountAmount: 1, discountPercentage: 2.5, quantity: 5, discountTotal: 5, total: 195,
    ...overrides,
  });

  it('resolves presets and validates custom ranges', () => {
    expect(resolveReportPeriod('week', '2026-10-05')).toMatchObject({ from: '2026-09-29', to: '2026-10-05' });
    expect(resolveReportPeriod('month', '2026-10-05').from).toBe('2026-09-06');
    expect(validateReportRange('2026-10-05', '2026-10-01')).toMatch(/start date/);
    expect(validateReportRange('2026-10-01', '2026-10-05')).toBeNull();
  });

  it('aggregates sales, cost and profit per vendor, category and product', () => {
    const report = buildSalesReport(
      [
        line({}),
        line({ billId: 'B2', quantity: 10, total: 390 }),
        line({ billId: 'B2', vendorId: 'V2', vendorName: 'Milkymist', categoryId: 'C9', productId: 'P9', purchasePrice: 30, sellingPrice: 40, quantity: 2, total: 80 }),
      ],
      resolveReportPeriod('today', '2026-10-05'),
      '2026-10-05T10:00:00Z',
    );
    expect(report.billCount).toBe(2);
    expect(report.totals).toMatchObject({ quantity: 17, sales: 665, cost: 630, profit: 35 });
    const aavin = report.vendors[0];
    expect(aavin).toMatchObject({ vendorName: 'Aavin', sales: 585, cost: 570, profit: 15, share: 87.97 });
    expect(aavin.categories[0].products[0]).toMatchObject({ quantity: 15, averageRate: 39, averageCost: 38, margin: 2.56 });
    expect(report.vendors[1]).toMatchObject({ vendorName: 'Milkymist', profit: 20, margin: 25 });
    expect(report.daily).toEqual([{ date: '2026-10-05', sales: 665, profit: 35 }]);
  });
});
