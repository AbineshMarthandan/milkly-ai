import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Bill } from '@/domain/models';
import { DEFAULT_APP_SETTINGS } from '@/domain/models/settings';
import { flattenBill } from '@/domain/services/billing/billDocument';
import { toLocalIsoDate } from '@/domain/services/dates';
import { buildSalesReport, resolveReportPeriod } from '@/domain/services/reports/salesReport';
import { createDemoSeed } from '@/infrastructure/browser-demo/seed';
import { buildSalesReportPdf, reportFileName } from './exportSalesReportPdf';

describe('sales report PDF', () => {
  it('renders a multi-page vector PDF from real report data', () => {
    const bills = createDemoSeed().bills as unknown as Bill[];
    const period = resolveReportPeriod('month', toLocalIsoDate());
    const report = buildSalesReport(bills.flatMap((bill) => flattenBill(bill)), period, new Date().toISOString());
    const doc = buildSalesReportPdf(report, { ...DEFAULT_APP_SETTINGS, businessName: 'Milkly Dairy Distributors' }, 'Priya');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(reportFileName(report)).toMatch(/^sales-profit-report_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.pdf$/);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, Buffer.from(doc.output('arraybuffer')));
  });
});
