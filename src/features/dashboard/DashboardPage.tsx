import { useQuery } from '@tanstack/react-query';
import { Building2, FilePlus2, MapPinned, Package, Receipt, Store, Tags, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { toLocalIsoDate } from '@/domain/services/dates';
import { Button } from '@/components/common/Button';
import { ErrorState, Skeleton } from '@/components/common/Feedback';
import { Card, CardHeader, PageHeader } from '@/components/common/Layout';
import { BarList } from '@/components/charts/BarList';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { StatTile } from '@/components/charts/StatTile';
import { queryKeys } from '@/constants/queryKeys';
import { useAppSettings, useMoney } from '@/hooks/useAppSettings';
import { useCan, useCurrentUser, useServices } from '@/hooks/useSession';
import { formatDate, formatMoneyCompact, formatNumber, formatShortDate } from '@/utils/format';
import { BillStatusBadge } from '../pastBills/PastBillsPage';

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * Dashboard. Master counts reuse the cached collections; bill figures read
 * only this month's bill headers; top products (line items) load last and
 * separately so the rest of the page never waits for them.
 */
export default function DashboardPage() {
  const services = useServices();
  const user = useCurrentUser();
  const can = useCan();
  const money = useMoney();
  const { data: settings } = useAppSettings();
  const currency = settings?.data.currency ?? 'INR';
  const today = toLocalIsoDate();

  const masters = useQuery({ queryKey: queryKeys.dashboardMasters, queryFn: () => services.dashboard.getMasterCounts() });
  const bills = useQuery({ queryKey: queryKeys.dashboardBills(today), queryFn: () => services.dashboard.getBillStats(today), staleTime: 60_000 });
  const products = useQuery({
    queryKey: queryKeys.dashboardProducts(today),
    queryFn: () => services.dashboard.getTopProducts(today),
    enabled: bills.isSuccess,
    staleTime: 5 * 60_000,
  });

  const stats = bills.data;
  const counts = masters.data;
  const masterTiles = [
    { label: 'Vendors', icon: Building2, to: '/masters/vendors', count: counts?.vendors },
    { label: 'Categories', icon: Tags, to: '/masters/categories', count: counts?.categories },
    { label: 'Products', icon: Package, to: '/masters/products', count: counts?.products },
    { label: 'Routes', icon: MapPinned, to: '/masters/routes', count: counts?.routes },
    { label: 'Customers', icon: Store, to: '/masters/customers', count: counts?.customers },
  ];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.displayName.split(/[\s(]/)[0] ?? ''}`}
        description={formatDate(today)}
        actions={
          can('bill:create') && (
            <Link to="/billing/new">
              <Button icon={<FilePlus2 className="size-4" />}>Create bill</Button>
            </Link>
          )
        }
      />

      {bills.error ? (
        <Card className="mb-5">
          <ErrorState error={bills.error} onRetry={() => void bills.refetch()} compact />
        </Card>
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile emphasis label="Today’s sales" icon={Wallet} loading={bills.isLoading} value={money(stats?.todaySales ?? 0)} hint={`${stats?.todayCount ?? 0} bills today`} />
          <StatTile label="Today’s bills" icon={Receipt} loading={bills.isLoading} value={formatNumber(stats?.todayCount ?? 0)} to="/billing/history" />
          <StatTile label="Sales this month" icon={TrendingUp} loading={bills.isLoading} value={money(stats?.monthSales ?? 0)} hint={`${stats?.monthCount ?? 0} bills`} />
          <StatTile label="Total historical bills" icon={Receipt} loading={bills.isLoading} value={formatNumber(stats?.totalBills ?? 0)} hint="All time, including invalid" />
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {masterTiles.map((tile) => (
          <StatTile
            key={tile.label}
            label={tile.label}
            icon={tile.icon}
            to={tile.to}
            loading={masters.isLoading}
            value={formatNumber(tile.count?.active ?? 0)}
            hint={tile.count && tile.count.total > tile.count.active ? `${tile.count.total - tile.count.active} inactive` : 'Active'}
          />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Sales, last 14 days" description="Finalized bills, grand total per day" />
          <div className="p-4">
            {bills.isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <ColumnChart
                seriesLabel="Sales"
                format={money}
                formatTick={(value) => formatMoneyCompact(value, currency)}
                data={(stats?.daily ?? []).map((day) => ({
                  key: day.date,
                  label: formatShortDate(day.date),
                  value: day.total,
                  details: [`${day.count} bill${day.count === 1 ? '' : 's'}`],
                }))}
              />
            )}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Top vendors this month" description="By sales" />
          <div className="p-5">
            {bills.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <BarList ariaLabel="Top vendors this month" items={(stats?.topVendors ?? []).map((vendor) => ({ id: vendor.id, label: vendor.name, value: vendor.total, display: money(vendor.total) }))} />
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Top products this month" description="By sales" />
          <div className="p-5">
            {products.isLoading || bills.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : products.error ? (
              <ErrorState error={products.error} onRetry={() => void products.refetch()} compact />
            ) : (
              <BarList
                ariaLabel="Top products this month"
                color="var(--color-chart-3)"
                items={(products.data ?? []).map((product) => ({
                  id: product.id,
                  label: product.name,
                  sublabel: product.detail,
                  value: product.total,
                  display: `${money(product.total)} · ${formatNumber(product.quantity ?? 0)} qty`,
                }))}
              />
            )}
          </div>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader
            title="Recent bills"
            actions={
              <Link to="/billing/history" className="text-xs font-medium text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          {bills.isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : stats?.recent.length ? (
            <ul className="divide-y divide-slate-100">
              {stats.recent.map((bill) => (
                <li key={bill._id}>
                  <Link to={`/billing/history/${bill._id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
                    <span className="w-24 shrink-0 font-mono text-xs font-semibold text-brand-700">{bill.billNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-800">
                      {bill.customerSnapshot.storeName}
                      <span className="ml-2 text-xs text-slate-500">{bill.routeSnapshot.routeName}</span>
                    </span>
                    <span className="hidden text-xs text-slate-500 sm:inline">{formatDate(bill.billDate)}</span>
                    <BillStatusBadge status={bill.status} />
                    <span className="tabular w-24 text-right font-medium text-slate-900">{money(bill.grandTotal)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No bills yet this month.</p>
          )}
        </Card>
      </div>
    </>
  );
}
