import { ArrowLeft, Ban, FilePlus2, Info, Pencil, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DEFAULT_APP_SETTINGS, PAPER_SIZE_LABELS, isThermal } from '@/domain/models/settings';
import { BILL_RULE_MESSAGES, canMarkInvalid, isBillEditable } from '@/domain/services/billing/billRules';
import { toLocalIsoDate } from '@/domain/services/dates';
import { Button } from '@/components/common/Button';
import { ErrorState, FullPageSpinner } from '@/components/common/Feedback';
import { Card, CardHeader, PageHeader } from '@/components/common/Layout';
import { PrintableBill } from '@/components/billing/PrintableBill';
import { usePrintBill } from '@/components/billing/PrintProvider';
import { useAppSettings, useMoney } from '@/hooks/useAppSettings';
import { useCan } from '@/hooks/useSession';
import { useUserName } from '@/hooks/useUserDirectory';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime } from '@/utils/format';
import { useBill } from '../billing/useBilling';
import { BillStatusBadge } from './PastBillsPage';
import { useMarkInvalid } from './usePastBills';

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{children}</dd>
    </div>
  );
}

/** A saved bill exactly as stored (snapshot prices), with print/edit/cancel actions. */
export default function BillDetailPage() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const money = useMoney();
  const userName = useUserName();
  const print = usePrintBill();
  const bill = useBill(billId);
  const { data: settingsDoc } = useAppSettings();
  const { markInvalid, marking } = useMarkInvalid();
  const settings = settingsDoc?.data ?? DEFAULT_APP_SETTINGS;

  if (bill.isLoading) return <FullPageSpinner label="Loading bill…" />;
  if (bill.error || !bill.data) return <ErrorState error={bill.error} onRetry={() => void bill.refetch()} />;
  const data = bill.data;
  const thermal = isThermal(settings.paperSize);
  const editable = isBillEditable(data, toLocalIsoDate());
  const rebillLink = `/billing/new?route=${encodeURIComponent(data.routeId)}&customer=${encodeURIComponent(data.customerId)}&copy=${encodeURIComponent(data._id)}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/billing/history" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3" /> Past bills
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            Bill {data.billNumber} <BillStatusBadge status={data.status} />
          </span>
        }
        description={`${data.customerSnapshot.storeName} · ${data.routeSnapshot.routeName} · ${formatDate(data.billDate)}`}
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => print(data)}>
              Print
            </Button>
            {editable && can('bill:update') && (
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/billing/edit/${data._id}`)}>
                Edit
              </Button>
            )}
            {data.status === 'cancelled' && can('bill:create') && (
              <Button variant="secondary" icon={<FilePlus2 className="size-4" />} onClick={() => navigate(rebillLink)}>
                Re-bill today
              </Button>
            )}
            {canMarkInvalid(data) && can('bill:cancel') && (
              <Button variant="danger" icon={<Ban className="size-4" />} loading={marking} onClick={() => void markInvalid(data)}>
                Mark as invalid
              </Button>
            )}
          </>
        }
      />
      {data.status === 'finalized' && !editable && can('bill:update') && (
        <p className="-mt-2 mb-4 flex items-start gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          {BILL_RULE_MESSAGES.editTodayOnly}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-x-auto bg-slate-100/70 p-4 sm:p-6">
          <div className="mb-3 text-center text-xs text-slate-500">Print preview · {PAPER_SIZE_LABELS[settings.paperSize]}</div>
          <div className={cn('mx-auto bg-white shadow-md', thermal ? 'w-fit px-[4mm] py-4' : 'max-w-[210mm] p-8')}>
            <PrintableBill bill={data} settings={settings} />
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Summary" />
            <dl className="divide-y divide-slate-100 px-5 py-2">
              <Meta label="Grand total">
                <b className="tabular">{money(data.grandTotal)}</b>
              </Meta>
              <Meta label="Items · Qty">
                {data.itemCount} · {data.totalQuantity}
              </Meta>
              <Meta label="Discount">{money(data.totalDiscount)}</Meta>
              {data.vendorSummary.map((vendor) => (
                <Meta key={vendor.vendorId} label={vendor.vendorName}>
                  {money(vendor.total)}
                </Meta>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="History" description="Prices and names are frozen at save time." />
            <dl className="divide-y divide-slate-100 px-5 py-2">
              <Meta label="Finalized">
                {data.finalizedByName || userName(data.finalizedBy)}
                <div className="text-xs text-slate-500">{formatDateTime(data.finalizedAt)}</div>
              </Meta>
              {data.version > 1 && (
                <Meta label="Last changed">
                  {userName(data.updatedBy)}
                  <div className="text-xs text-slate-500">{formatDateTime(data.updatedAt)}</div>
                </Meta>
              )}
              {data.status === 'cancelled' && (
                <Meta label="Marked invalid">
                  {userName(data.cancelledBy)}
                  <div className="text-xs text-slate-500">{formatDateTime(data.cancelledAt)}</div>
                  <div className="mt-1 text-xs text-rose-700">Reason: {data.cancelReason}</div>
                </Meta>
              )}
              <Meta label="Bill ID">
                <span className="font-mono text-xs">{data._id}</span>
              </Meta>
              <Meta label="Revision">v{data.version}</Meta>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
