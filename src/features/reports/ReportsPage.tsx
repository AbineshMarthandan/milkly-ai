import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Play } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { toAppError } from '@/domain/errors/AppError';
import { DEFAULT_APP_SETTINGS } from '@/domain/models/settings';
import { REPORT_PRESET_LABELS, REPORT_PRESETS, resolveReportPeriod, validateReportRange, type ReportPeriod, type ReportPreset } from '@/domain/services';
import { addDays, toLocalIsoDate } from '@/domain/services/dates';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/Feedback';
import { Card, CardHeader, PageHeader, SegmentedControl } from '@/components/common/Layout';
import { BarList } from '@/components/charts/BarList';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { StatTile } from '@/components/charts/StatTile';
import { Input } from '@/components/forms/Field';
import { queryKeys } from '@/constants/queryKeys';
import { useAppSettings, useMoney } from '@/hooks/useAppSettings';
import { useCurrentUser, useServices } from '@/hooks/useSession';
import { cn } from '@/utils/cn';
import { formatDate, formatMoneyCompact, formatNumber, formatPercent, formatShortDate } from '@/utils/format';
import { VendorBreakdown } from './VendorBreakdown';

/** Sales & profit by vendor → category → product, from saved bills. */
export default function ReportsPage() {
  const services = useServices();
  const user = useCurrentUser();
  const money = useMoney();
  const { data: settingsDoc } = useAppSettings();
  const settings = settingsDoc?.data ?? DEFAULT_APP_SETTINGS;
  const today = toLocalIsoDate();

  const [preset, setPreset] = useState<ReportPreset>('today');
  const [customFrom, setCustomFrom] = useState(addDays(today, -6));
  const [customTo, setCustomTo] = useState(today);
  const [period, setPeriod] = useState<ReportPeriod>(() => resolveReportPeriod('today', today));
  const [downloading, setDownloading] = useState(false);
  const customError = preset === 'custom' ? validateReportRange(customFrom, customTo) : null;

  const report = useQuery({
    queryKey: queryKeys.report(period),
    queryFn: () => services.reports.generateSalesReport(period),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const choosePreset = (next: ReportPreset) => {
    setPreset(next);
    if (next !== 'custom') setPeriod(resolveReportPeriod(next, today));
  };
  const generateCustom = () => {
    if (customError) return;
    setPeriod(resolveReportPeriod('custom', today, { from: customFrom, to: customTo }));
  };

  const downloadPdf = async () => {
    if (!report.data) return;
    setDownloading(true);
    try {
      // jsPDF is loaded only when someone actually downloads a report.
      const { exportSalesReportPdf } = await import('./exportSalesReportPdf');
      await exportSalesReportPdf(report.data, settings, user?.displayName ?? '');
      toast.success('Report downloaded');
    } catch (error) {
      toast.error(toAppError(error).userMessage);
    } finally {
      setDownloading(false);
    }
  };

  const data = report.data;
  const showingCurrent = data && data.period.from === period.from && data.period.to === period.to;
  const multiDay = period.from !== period.to;

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Sales & profit"
        description="From valid saved bills only (invalid bills excluded). Profit uses the purchase price recorded on each bill line."
        actions={
          <Button icon={<Download className="size-4" />} onClick={() => void downloadPdf()} loading={downloading} disabled={!data || !showingCurrent || data.billCount === 0}>
            Download PDF
          </Button>
        }
      />

      <Card className="mb-5 flex flex-wrap items-end gap-3 p-3">
        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">Period</div>
          <SegmentedControl
            ariaLabel="Report period"
            value={preset}
            onChange={choosePreset}
            options={REPORT_PRESETS.map((value) => ({ value, label: REPORT_PRESET_LABELS[value] }))}
          />
        </div>
        {preset === 'custom' && (
          <>
            <label className="text-xs font-medium text-slate-500">
              From
              <Input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} className="mt-1 w-40" />
            </label>
            <label className="text-xs font-medium text-slate-500">
              To
              <Input type="date" value={customTo} min={customFrom} max={today} onChange={(event) => setCustomTo(event.target.value)} className="mt-1 w-40" />
            </label>
            <Button icon={<Play className="size-4" />} onClick={generateCustom} disabled={Boolean(customError)}>
              Generate report
            </Button>
            {customError && <p className="w-full text-xs text-rose-600">{customError}</p>}
          </>
        )}
        <div className="ml-auto text-right text-xs text-slate-500">
          <div className="font-medium text-slate-700">
            {period.label}: {formatDate(period.from)}
            {multiDay && ` – ${formatDate(period.to)}`}
          </div>
          {data && <div>{formatNumber(data.billCount)} bills</div>}
        </div>
      </Card>

      {report.isLoading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : report.error ? (
        <Card>
          <ErrorState error={report.error} onRetry={() => void report.refetch()} />
        </Card>
      ) : data && data.billCount === 0 ? (
        <Card>
          <EmptyState icon={<BarChart3 className="size-6" />} title="No saved bills in this period" description="Choose a different period, or save some bills first." />
        </Card>
      ) : data ? (
        // Refetch keeps the frame: the previous report stays visible, dimmed.
        <div className={cn('space-y-5 transition-opacity', report.isFetching && !showingCurrent && 'opacity-50')}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Sales" value={money(data.totals.sales)} />
            <StatTile label="Purchase cost" value={money(data.totals.cost)} />
            <StatTile emphasis label="Profit" value={money(data.totals.profit)} />
            <StatTile label="Margin" value={formatPercent(data.totals.margin)} hint="Profit ÷ sales" />
            <StatTile label="Bills" value={formatNumber(data.billCount)} />
            <StatTile label="Units sold" value={formatNumber(data.totals.quantity)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Sales by vendor" description="Share of total sales" />
              <div className="p-5">
                <BarList
                  ariaLabel="Sales by vendor"
                  items={data.vendors.map((vendor) => ({
                    id: vendor.vendorId,
                    label: vendor.vendorName,
                    sublabel: formatPercent(vendor.share),
                    value: vendor.sales,
                    display: money(vendor.sales),
                  }))}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Profit by vendor" description="Sales minus purchase cost" />
              <div className="p-5">
                <BarList
                  ariaLabel="Profit by vendor"
                  color="var(--color-chart-3)"
                  items={data.vendors.map((vendor) => ({
                    id: vendor.vendorId,
                    label: vendor.vendorName,
                    sublabel: `${formatPercent(vendor.margin)} margin`,
                    value: vendor.profit,
                    display: money(vendor.profit),
                  }))}
                />
              </div>
            </Card>
          </div>

          {multiDay && (
            <Card>
              <CardHeader title="Sales per day" description="Hover a day for its profit" />
              <div className="p-4">
                <ColumnChart
                  seriesLabel="Sales"
                  format={money}
                  formatTick={(value) => formatMoneyCompact(value, settings.currency)}
                  data={data.daily.map((day) => ({
                    key: day.date,
                    label: formatShortDate(day.date),
                    value: day.sales,
                    details: [`Profit ${money(day.profit)}`],
                  }))}
                />
              </div>
            </Card>
          )}

          <div className="space-y-5">
            <h2 className="text-sm font-semibold text-slate-900">Breakdown by vendor, category and product</h2>
            {data.vendors.map((vendor, index) => (
              <VendorBreakdown key={vendor.vendorId} vendor={vendor} colorIndex={index} />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
