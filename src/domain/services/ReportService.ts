import { validationError } from '../errors/AppError';
import { assertCan } from '../permissions/permissions';
import type { BillRepository } from '../repositories';
import type { ServiceContext } from './context';
import { buildSalesReport, validateReportRange, type ReportPeriod, type SalesReport } from './reports/salesReport';

export class ReportService {
  constructor(
    private readonly bills: BillRepository,
    private readonly context: ServiceContext,
  ) {}

  /** Sales & profit for finalized bills in the period (bills marked invalid are excluded). */
  async generateSalesReport(period: ReportPeriod): Promise<SalesReport> {
    assertCan(this.context.getActor(), 'report:view');
    const problem = validateReportRange(period.from, period.to);
    if (problem) throw validationError({ range: problem });
    const lines = await this.bills.listLines({ dateFrom: period.from, dateTo: period.to, statuses: ['finalized'] });
    return buildSalesReport(lines, period, new Date().toISOString());
  }
}
