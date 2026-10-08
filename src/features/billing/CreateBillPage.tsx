import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/Layout';
import { FullPageSpinner } from '@/components/common/Feedback';
import { useConfirm } from '@/components/modals/ConfirmProvider';
import { useCurrentUser } from '@/hooks/useSession';
import { BillEditor } from './BillEditor';
import { useBillDraftStore, useDraft } from './billDraftStore';

export default function CreateBillPage() {
  const user = useCurrentUser();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  // One draft per user on this device, restored after a refresh.
  const draftKey = `${user?._id ?? 'anonymous'}:new`;
  const draft = useDraft(draftKey);

  useEffect(() => {
    useBillDraftStore.getState().ensure(draftKey);
  }, [draftKey]);

  // "Create bill" links from route folders and store cards: ?route=…&customer=…
  const routeParam = params.get('route');
  const customerParam = params.get('customer');
  useEffect(() => {
    if (!routeParam) return;
    let cancelled = false;
    void (async () => {
      const store = useBillDraftStore.getState();
      const current = store.drafts[draftKey];
      const switching = current && current.customerId !== customerParam && Object.keys(current.quantities).length > 0;
      const ok =
        !switching ||
        (await confirm({
          title: 'Start a new bill?',
          description: 'You have an unsaved bill with quantities entered. It will be cleared.',
          confirmLabel: 'Start new bill',
          tone: 'danger',
        }));
      if (cancelled) return;
      if (ok) store.update(draftKey, { routeId: routeParam, customerId: customerParam, ...(switching ? { quantities: {}, notes: '' } : {}) });
      setParams({}, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [routeParam, customerParam, draftKey, confirm, setParams]);

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Create bill"
        description="Pick the route and store, enter quantities, then save. Vendors and categories follow their priority order."
      />
      {draft ? <BillEditor draftKey={draftKey} mode="create" /> : <FullPageSpinner />}
    </>
  );
}
