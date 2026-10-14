import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Category, Product, Vendor } from '@/domain/models';
import { DEFAULT_APP_SETTINGS } from '@/domain/models/settings';
import { buildBillVendors, flattenBill } from '@/domain/services/billing/billDocument';
import { buildCatalog } from '@/domain/services/billing/catalog';
import { addDays, toLocalIsoDate } from '@/domain/services/dates';
import { buildSalesReport, resolveReportPeriod } from '@/domain/services/reports/salesReport';
import { buildSalesReportPdf, reportFileName } from './exportSalesReportPdf';

const base = { isActive: true, version: 1, createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' };

/** Two weeks of bills across two vendors, so the report has days, vendors, categories and products. */
function sampleLines() {
  const vendors: Vendor[] = [
    { ...base, _id: 'V1', vendorId: 'V1', vendorName: 'Aavin', priority: 1 },
    { ...base, _id: 'V2', vendorId: 'V2', vendorName: 'Milkymist', priority: 2 },
  ];
  const categories: Category[] = [
    { ...base, _id: 'C1', vendorId: 'V1', categoryName: 'Milk', priority: 1 },
    { ...base, _id: 'C2', vendorId: 'V1', categoryName: 'Curd', priority: 2 },
    { ...base, _id: 'C3', vendorId: 'V2', categoryName: 'Paneer', priority: 1 },
  ];
  const product = (id: string, categoryId: string, vendorId: string, productName: string, unit: string, purchasePrice: number, mrp: number, sellingPrice: number): Product => ({
    ...base,
    _id: id,
    vendorId,
    categoryId,
    productName,
    unit,
    purchasePrice,
    mrp,
    sellingPrice,
    priority: Number(id.slice(1)),
  });
  const products = [
    product('P1', 'C1', 'V1', 'Milk', '1 L', 38, 40, 39),
    product('P2', 'C1', 'V1', 'Toned Milk', '500 ml', 21, 24, 23),
    product('P3', 'C2', 'V1', 'Curd', '500 g', 26, 30, 28.5),
    product('P4', 'C3', 'V2', 'Paneer', '200 g', 78, 90, 86),
  ];
  const catalog = buildCatalog({ vendors, categories, products });
  const today = toLocalIsoDate();
  return Array.from({ length: 14 }, (_, day) =>
    flattenBill({
      _id: `B${day}`,
      billNumber: `MLB${String(day + 1).padStart(6, '0')}`,
      billDate: addDays(today, -day),
      itemsRevision: 'r1',
      vendors: buildBillVendors(catalog, { P1: 10 + day, P2: 5, P3: day % 3, P4: day % 2 ? 2 : 0 }),
    }),
  ).flat();
}

describe('sales report PDF', () => {
  it('renders a vector PDF from report data', () => {
    const period = resolveReportPeriod('month', toLocalIsoDate());
    const report = buildSalesReport(sampleLines(), period, new Date().toISOString());
    const doc = buildSalesReportPdf(report, { ...DEFAULT_APP_SETTINGS, businessName: 'Milkly Dairy Distributors' }, 'Priya');
    expect(report.vendors.map((vendor) => vendor.vendorName)).toEqual(['Aavin', 'Milkymist']);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(reportFileName(report)).toMatch(/^sales-profit-report_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.pdf$/);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, Buffer.from(doc.output('arraybuffer')));
  });
});
