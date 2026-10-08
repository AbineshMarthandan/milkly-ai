import { Ban, Eye, FilePlus2, Pencil, Printer, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { BillHeader, BillStatus } from '@/domain/models';
import { addDays, startOfMonth, toLocalIsoDate } from '@/domain/services/dates';
import { sumMoney } from '@/domain/services/money';
import { sortByPriority } from '@/domain/services/ordering';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { Badge, Card, PageHeader, SegmentedControl } from '@/components/common/Layout';
import { CardGrid, GridSkeleton, ItemCard, type CardAction } from '@/components/explorer/Explorer';
import { Combobox } from '@/components/forms/Combobox';
import { Input, Select } from '@/components/forms/Field';
import { useMoney } from '@/hooks/useAppSettings';
import { useCan } from '@/hooks/useSession';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';
import { ExplorerToolbar } from '../shared/MasterComponents';
import { useMasterList } from '../shared/masterData';
import { useBillList, useCancelBill, usePrintSavedBill } from './usePastBills';

type StatusFilter = 'finalized' | 'cancelled' | 'all';
const STATUS_QUERY: Record<StatusFilter, BillStatus[]> = {
  finalized: ['finalized'],
  cancelled: ['cancelled'],
  all: ['finalized', 'cancelled'],
};

type RangePreset = 'today' | '7d' | '30d' | 'month' | 'custom';
const PAGE = 36;

export function BillStatusBadge({ status }: { status: BillStatus }) {
  if (status === 'cancelled') return <Badge tone="red">Cancelled</Badge>;
  if (status === 'draft') return <Badge tone="amber">Draft</Badge>;
  return <Badge tone="green">Finalized</Badge>;
}

/** Saved bills only, as cards. Drafts — printed or not — never appear here. */
export default function PastBillsPage() {
  const today = toLocalIsoDate();
  const can = useCan();
  const money = useMoney();
  const navigate = useNavigate();
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [dateFrom, setDateFrom] = useState(addDays(today, -29));
  const [dateTo, setDateTo] = useState(today);
  const [status, setStatus] = useState<StatusFilter>('finalized');
  const [routeId, setRouteId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE);

  const bills = useBillList({ dateFrom, dateTo, statuses: STATUS_QUERY[status] });
  const { data: routes = [] } = useMasterList('routes');
  const { data: customers = [] } = useMasterList('customers');
  const { data: vendors = [] } = useMasterList('vendors');
  const { printById, loadingId } = usePrintSavedBill();
  const { cancelBill } = useCancelBill();

  const applyPreset = (next: RangePreset) => {
    setPreset(next);
    setVisible(PAGE);
    if (next === 'today') setDateFrom(today);
    if (next === '7d') setDateFrom(addDays(today, -6));
    if (next === '30d') setDateFrom(addDays(today, -29));
    if (next === 'month') setDateFrom(startOfMonth(today));
    if (next !== 'custom') setDateTo(today);
  };

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (bills.data ?? []).filter(
      (bill) =>
        (!routeId || bill.routeId === routeId) &&
        (!customerId || bill.customerId === customerId) &&
        (!vendorId || bill.vendorIds.includes(vendorId)) &&
        (!needle || `${bill.billNumber} ${bill.customerSnapshot.storeName}`.toLowerCase().includes(needle)),
    );
  }, [bills.data, routeId, customerId, vendorId, search]);
  const finalizedTotal = sumMoney(rows.filter((bill) => bill.status === 'finalized').map((bill) => bill.grandTotal));

  const routeOptions = sortByPriority(routes, (route) => route.routeName).map((route) => ({ value: route._id, label: route.routeName, meta: route.routeCode }));
  const customerOptions = sortByPriority(
    customers.filter((customer) => !routeId || customer.routeId === routeId),
    (customer) => customer.storeName,
  ).map((customer) => ({ value: customer._id, label: customer.storeName, meta: customer._id }));
  const vendorOptions = sortByPriority(vendors, (vendor) => vendor.vendorName).map((vendor) => ({ value: vendor._id, label: vendor.vendorName }));

  const actionsFor = (bill: BillHeader): CardAction[] => {
    const actions: CardAction[] = [
      { label: 'View', icon: Eye, onSelect: () => navigate(`/billing/history/${bill._id}`) },
      { label: loadingId === bill._id ? 'Preparing…' : 'Print', icon: Printer, onSelect: () => void printById(bill._id) },
    ];
    if (bill.status === 'finalized' && can('bill:update')) {
      actions.push({ label: 'Edit', icon: Pencil, onSelect: () => navigate(`/billing/edit/${bill._id}`) });
    }
    if (bill.status === 'finalized' && can('bill:cancel')) {
      actions.push({ label: 'Cancel bill', icon: Ban, tone: 'danger', onSelect: () => void cancelBill(bill) });
    }
    return actions;
  };

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Past bills"
        description="Saved bills only — drafts and print-only bills are never listed here."
        actions={
          can('bill:create') && (
            <Link to="/billing/new">
              <Button icon={<FilePlus2 className="size-4" />}>Create bill</Button>
            </Link>
          )
        }
      />

      <Card className="mb-5 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-xs font-medium text-slate-500">Period</div>
            <SegmentedControl
              ariaLabel="Date range"
              value={preset}
              onChange={applyPreset}
              options={[
                { value: 'today', label: 'Today' },
                { value: '7d', label: '7 days' },
                { value: '30d', label: '30 days' },
                { value: 'month', label: 'This month' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
          </div>
          <label className="text-xs font-medium text-slate-500">
            From
            <Input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(event) => {
                setPreset('custom');
                if (event.target.value) setDateFrom(event.target.value);
              }}
              className="mt-1 w-40"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            To
            <Input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(event) => {
                setPreset('custom');
                if (event.target.value) setDateTo(event.target.value);
              }}
              className="mt-1 w-40"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Status
            <Select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="mt-1 w-36">
              <option value="finalized">Finalized</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All</option>
            </Select>
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Combobox
            options={routeOptions}
            value={routeId}
            onChange={(value) => {
              setRouteId(value);
              setCustomerId(null);
            }}
            placeholder="All routes"
            clearable
          />
          <Combobox options={customerOptions} value={customerId} onChange={setCustomerId} placeholder="All customers" clearable />
          <Combobox options={vendorOptions} value={vendorId} onChange={setVendorId} placeholder="All vendors" clearable />
        </div>
      </Card>

      <ExplorerToolbar search={search} onSearch={setSearch} placeholder="Search bill no or store…">
        {rows.length > 0 && (
          <div className="flex gap-4 text-sm text-slate-500 sm:ml-auto">
            <span>
              {rows.length} bill{rows.length === 1 ? '' : 's'}
            </span>
            <span>
              Finalized total <b className="tabular text-slate-900">{money(finalizedTotal)}</b>
            </span>
          </div>
        )}
      </ExplorerToolbar>

      {bills.isLoading ? (
        <GridSkeleton count={6} />
      ) : bills.error ? (
        <ErrorState error={bills.error} onRetry={() => void bills.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Receipt className="size-6" />} title="No bills in this period" description="Try a wider date range or different filters." />
      ) : (
        <>
          <CardGrid>
            {rows.slice(0, visible).map((bill) => {
              const cancelled = bill.status === 'cancelled';
              return (
                <ItemCard
                  key={bill._id}
                  name={bill.billNumber}
                  title={<span className="font-mono">{bill.billNumber}</span>}
                  subtitle={`${formatDate(bill.billDate)} · ${bill.routeSnapshot.routeName}`}
                  badge={<BillStatusBadge status={bill.status} />}
                  actions={actionsFor(bill)}
                  onOpen={() => navigate(`/billing/history/${bill._id}`)}
                  className={cn(cancelled && 'border-rose-200 bg-rose-50/30')}
                  footer={
                    <>
                      <span>By {bill.createdByName || '—'}</span>
                      <span>
                        {bill.itemCount} item{bill.itemCount === 1 ? '' : 's'}
                      </span>
                    </>
                  }
                >
                  <div className="truncate font-medium text-slate-800">{bill.customerSnapshot.storeName}</div>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <span className={cn('text-2xl font-semibold tracking-tight', cancelled ? 'text-slate-400 line-through' : 'text-slate-900')}>
                      {money(bill.grandTotal)}
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {bill.vendorSummary.map((vendor) => (
                        <span key={vendor.vendorId} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          {vendor.vendorName}
                        </span>
                      ))}
                    </span>
                  </div>
                  {cancelled && bill.cancelReason && <p className="mt-2 line-clamp-1 text-xs text-rose-700">{bill.cancelReason}</p>}
                </ItemCard>
              );
            })}
          </CardGrid>
          {rows.length > visible && (
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" onClick={() => setVisible((count) => count + PAGE)}>
                Show more ({rows.length - visible} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
