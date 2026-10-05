import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { flattenBill, quantitiesFromBill } from '@/domain/services/billing/billDocument';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState, FullPageSpinner } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { useCurrentUser } from '@/hooks/useSession';
import { formatDate } from '@/utils/format';
import { BillEditor } from './BillEditor';
import { useBillDraftStore, useDraft } from './billDraftStore';
import { useBill } from './useBilling';

/** Edits a finalized bill (Super Admin / Tech Admin). Existing lines keep their saved prices. */
export default function EditBillPage() {
  const { billId } = useParams();
  const user = useCurrentUser();
  const bill = useBill(billId);
  const draftKey = `${user?._id ?? 'anonymous'}:edit:${billId}`;
  const draft = useDraft(draftKey);

  useEffect(() => {
    const loaded = bill.data;
    if (!loaded || loaded.status !== 'finalized') return;
    const existing = useBillDraftStore.getState().drafts[draftKey];
    // Reuse an in-progress edit only if it was started from this exact version.
    const stale = !existing?.editing || existing.editing.version !== loaded.version;
    useBillDraftStore.getState().ensure(
      draftKey,
      {
        routeId: loaded.routeId,
        customerId: loaded.customerId,
        billDate: loaded.billDate,
        notes: loaded.notes,
        quantities: quantitiesFromBill(loaded.vendors),
        editing: { billId: loaded._id, billNumber: loaded.billNumber, version: loaded.version, lockedLines: flattenBill(loaded) },
      },
      stale,
    );
  }, [bill.data, draftKey]);

  if (bill.isLoading) return <FullPageSpinner label="Loading bill…" />;
  if (bill.error) return <ErrorState error={bill.error} onRetry={() => void bill.refetch()} />;
  if (bill.data && bill.data.status !== 'finalized') {
    return (
      <EmptyState
        className="py-24"
        title="This bill cannot be edited"
        description="Cancelled bills are kept for the record and cannot be changed."
        action={
          <Link to={`/billing/history/${billId}`}>
            <Button variant="secondary">View bill</Button>
          </Link>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to={`/billing/history/${billId}`} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3" /> Back to bill
          </Link>
        }
        title={`Edit bill ${bill.data?.billNumber ?? ''}`}
        description={
          bill.data
            ? `${bill.data.customerSnapshot.storeName} · ${formatDate(bill.data.billDate)}. Existing lines keep the prices saved on the bill; new lines use today’s prices.`
            : undefined
        }
      />
      {draft?.editing ? <BillEditor draftKey={draftKey} mode="edit" /> : <FullPageSpinner />}
    </>
  );
}
