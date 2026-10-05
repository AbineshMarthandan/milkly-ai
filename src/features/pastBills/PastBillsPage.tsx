import { createColumnHelper } from '@tanstack/react-table';
import { Ban, Eye, FilePlus2, Pencil, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { BillHeader, BillStatus } from '@/domain/models';
import { addDays, startOfMonth, toLocalIsoDate } from '@/domain/services/dates';
import { sumMoney } from '@/domain/services/money';
import { sortByPriority } from '@/domain/services/ordering';
import { Button, IconButton } from '@/components/common/Button';
import { Badge, Card, PageHeader, SegmentedControl } from '@/components/common/Layout';
import { Combobox } from '@/components/forms/Combobox';
import { Input, Select } from '@/components/forms/Field';
import { DataTable } from '@/components/tables/DataTable';
import { useMoney } from '@/hooks/useAppSettings';
import { useCan } from '@/hooks/useSession';
import { formatDate } from '@/utils/format';
import { useMasterList } from '../shared/masterData';
import { useBillList, useCancelBill, usePrintSavedBill } from './usePastBills';

const column = createColumnHelper<BillHeader>();

type StatusFilter = 'finalized' | 'cancelled' | 'all';
const STATUS_QUERY: Record<StatusFilter, BillStatus[]> = {
  finalized: ['finalized'],
  cancelled: ['cancelled'],
  all: ['finalized', 'cancelled'],
};

type RangePreset = 'today' | '7d' | '30d' | 'month' | 'custom';

export function BillStatusBadge({ status }: { status: BillStatus }) {
  if (status === 'cancelled') return <Badge tone="red">Cancelled</Badge>;
  if (status === 'draft') return <Badge tone="amber">Draft</Badge>;
  return <Badge tone="green">Finalized</Badge>;
}

/** Saved bills only. Drafts — printed or not — never appear here. */
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

  const bills = useBillList({ dateFrom, dateTo, statuses: STATUS_QUERY[status] });
  const { data: routes = [] } = useMasterList('routes');
  const { data: customers = [] } = useMasterList('customers');
  const { data: vendors = [] } = useMasterList('vendors');
  const { printById, loadingId } = usePrintSavedBill();
  const { cancelBill } = useCancelBill();

  const applyPreset = (next: RangePreset) => {
    setPreset(next);
    if (next === 'today') setDateFrom(today);
    if (next === '7d') setDateFrom(addDays(today, -6));
    if (next === '30d') setDateFrom(addDays(today, -29));
    if (next === 'month') setDateFrom(startOfMonth(today));
    if (next !== 'custom') setDateTo(today);
  };

  const rows = useMemo(
    () =>
      (bills.data ?? []).filter(
        (bill) =>
          (!routeId || bill.routeId === routeId) &&
          (!customerId || bill.customerId === customerId) &&
          (!vendorId || bill.vendorIds.includes(vendorId)),
      ),
    [bills.data, routeId, customerId, vendorId],
  );
  const finalizedTotal = sumMoney(rows.filter((bill) => bill.status === 'finalized').map((bill) => bill.grandTotal));

  const routeOptions = sortByPriority(routes, (route) => route.routeName).map((route) => ({ value: route._id, label: route.routeName, meta: route.routeCode }));
  const customerOptions = sortByPriority(
    customers.filter((customer) => !routeId || customer.routeId === routeId),
    (customer) => customer.storeName,
  ).map((customer) => ({ value: customer._id, label: customer.storeName, meta: customer._id }));
  const vendorOptions = sortByPriority(vendors, (vendor) => vendor.vendorName).map((vendor) => ({ value: vendor._id, label: vendor.vendorName }));

  const columns = useMemo(
    () => [
      column.accessor('billNumber', {
        header: 'Bill No',
        cell: (info) => (
          <Link to={`/billing/history/${info.row.original._id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline" onClick={(event) => event.stopPropagation()}>
            {info.getValue()}
          </Link>
        ),
      }),
      column.accessor('billDate', { header: 'Date', cell: (info) => formatDate(info.getValue()), meta: { className: 'whitespace-nowrap' } }),
      column.accessor((bill) => bill.routeSnapshot.routeName, { id: 'route', header: 'Route', meta: { hideOnMobile: true } }),
      column.accessor((bill) => bill.customerSnapshot.storeName, {
        id: 'customer',
        header: 'Customer',
        cell: (info) => <span className="font-medium text-slate-900">{info.getValue()}</span>,
      }),
      column.accessor('itemCount', { header: 'Items', meta: { align: 'right', hideOnMobile: true } }),
      column.accessor('grandTotal', {
        header: 'Grand total',
        meta: { align: 'right' },
        cell: (info) => (
          <span className={info.row.original.status === 'cancelled' ? 'text-slate-400 line-through' : 'font-semibold text-slate-900'}>
            {money(info.getValue())}
          </span>
        ),
      }),
      column.accessor('createdByName', { header: 'Created by', meta: { hideOnMobile: true } }),
      column.accessor('status', { header: 'Status', cell: (info) => <BillStatusBadge status={info.getValue()} /> }),
      column.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const bill = row.original;
          return (
            <div className="flex justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
              <IconButton label={`View ${bill.billNumber}`} onClick={() => navigate(`/billing/history/${bill._id}`)}>
                <Eye className="size-4" />
              </IconButton>
              <IconButton label={`Print ${bill.billNumber}`} disabled={loadingId === bill._id} onClick={() => void printById(bill._id)}>
                <Printer className="size-4" />
              </IconButton>
              {bill.status === 'finalized' && can('bill:update') && (
                <IconButton label={`Edit ${bill.billNumber}`} onClick={() => navigate(`/billing/edit/${bill._id}`)}>
                  <Pencil className="size-4" />
                </IconButton>
              )}
              {bill.status === 'finalized' && can('bill:cancel') && (
                <IconButton label={`Cancel ${bill.billNumber}`} tone="danger" onClick={() => void cancelBill(bill)}>
                  <Ban className="size-4" />
                </IconButton>
              )}
            </div>
          );
        },
      }),
    ],
    [money, navigate, can, loadingId, printById, cancelBill],
  );

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

      <Card className="mb-4 p-3">
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

      <Card>
        <DataTable
          data={rows}
          columns={columns}
          loading={bills.isLoading}
          error={bills.error}
          onRetry={() => void bills.refetch()}
          searchPlaceholder="Search bill no or store…"
          getRowId={(bill) => bill._id}
          onRowClick={(bill) => navigate(`/billing/history/${bill._id}`)}
          rowClassName={(bill) => (bill.status === 'cancelled' ? 'bg-rose-50/30' : undefined)}
          emptyTitle="No bills in this period"
          emptyDescription="Try a wider date range or different filters."
          footer={
            rows.length > 0 && (
              <div className="flex justify-end gap-6 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-sm">
                <span className="text-slate-500">
                  {rows.length} bill{rows.length === 1 ? '' : 's'}
                </span>
                <span className="text-slate-600">
                  Finalized total: <b className="tabular text-slate-900">{money(finalizedTotal)}</b>
                </span>
              </div>
            )
          }
        />
      </Card>
    </>
  );
}
