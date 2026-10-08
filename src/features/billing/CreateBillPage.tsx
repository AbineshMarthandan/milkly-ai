import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { toAppError } from '@/domain/errors/AppError';
import { quantitiesFromBill } from '@/domain/services/billing/billDocument';
import { toLocalIsoDate } from '@/domain/services/dates';
import { PageHeader } from '@/components/common/Layout';
import { FullPageSpinner } from '@/components/common/Feedback';
import { useConfirm } from '@/components/modals/ConfirmProvider';
import { useCurrentUser, useServices } from '@/hooks/useSession';
import { BillEditor } from './BillEditor';
import { useBillDraftStore, useDraft } from './billDraftStore';

export default function CreateBillPage() {
  const user = useCurrentUser();
  const services = useServices();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  // One draft per user on this device, restored after a refresh.
  const draftKey = `${user?._id ?? 'anonymous'}:new`;
  const draft = useDraft(draftKey);

  useEffect(() => {
    const store = useBillDraftStore.getState();
    store.ensure(draftKey);
    // New bills are always dated today, even when a draft from an earlier day is restored.
    const today = toLocalIsoDate();
    if (store.drafts[draftKey]?.billDate !== today) store.update(draftKey, { billDate: today });
  }, [draftKey]);

  // Links from store cards / route folders: ?route=…&customer=…
  // "Re-bill today" from an invalid bill adds &copy=<billId> to copy its quantities.
  const routeParam = params.get('route');
  const customerParam = params.get('customer');
  const copyParam = params.get('copy');
  useEffect(() => {
    if (!routeParam) return;
    let cancelled = false;
    void (async () => {
      const store = useBillDraftStore.getState();
      const current = store.drafts[draftKey];
      const hasItems = current && Object.keys(current.quantities).length > 0;
      const replacing = hasItems && (current.customerId !== customerParam || Boolean(copyParam));
      const ok =
        !replacing ||
        (await confirm({
          title: 'Start a new bill?',
          description: 'You have an unsaved bill with quantities entered. It will be cleared.',
          confirmLabel: 'Start new bill',
          tone: 'danger',
        }));
      if (cancelled) return;
      if (ok) {
        store.update(draftKey, { routeId: routeParam, customerId: customerParam, ...(replacing ? { quantities: {}, notes: '' } : {}) });
        if (copyParam) {
          try {
            const source = await services.bills.get(copyParam);
            if (cancelled) return;
            const quantities = quantitiesFromBill(source.vendors);
            store.update(draftKey, { quantities, notes: '' });
            toast.success(`Copied ${Object.keys(quantities).length} items from ${source.billNumber}`, {
              description: 'Today’s prices apply. Check the quantities, then save.',
            });
          } catch (error) {
            toast.error(toAppError(error).userMessage);
          }
        }
      }
      setParams({}, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [routeParam, customerParam, copyParam, draftKey, confirm, setParams, services]);

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Create bill"
        description="Bills are dated today. Pick the route and store, enter quantities, then save — a store can have several bills in a day."
      />
      {draft ? <BillEditor draftKey={draftKey} mode="create" /> : <FullPageSpinner />}
    </>
  );
}
