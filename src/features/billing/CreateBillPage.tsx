import { useEffect } from 'react';
import { PageHeader } from '@/components/common/Layout';
import { FullPageSpinner } from '@/components/common/Feedback';
import { useCurrentUser } from '@/hooks/useSession';
import { BillEditor } from './BillEditor';
import { useBillDraftStore, useDraft } from './billDraftStore';

export default function CreateBillPage() {
  const user = useCurrentUser();
  // One draft per user on this device, restored after a refresh.
  const draftKey = `${user?._id ?? 'anonymous'}:new`;
  const draft = useDraft(draftKey);

  useEffect(() => {
    useBillDraftStore.getState().ensure(draftKey);
  }, [draftKey]);

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
