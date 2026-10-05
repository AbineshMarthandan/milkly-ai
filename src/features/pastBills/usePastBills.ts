import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { toAppError } from '@/domain/errors/AppError';
import type { BillHeader, BillStatus } from '@/domain/models';
import { queryKeys } from '@/constants/queryKeys';
import { usePrintBill } from '@/components/billing/PrintProvider';
import { useConfirm } from '@/components/modals/ConfirmProvider';
import { useServices } from '@/hooks/useSession';

export function useBillList(query: { dateFrom: string; dateTo: string; statuses: BillStatus[] }) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.billList(query),
    queryFn: () => services.bills.list(query),
    staleTime: 60_000,
  });
}

/** Loads the full bill (with lines) and sends it to the printer. */
export function usePrintSavedBill() {
  const services = useServices();
  const queryClient = useQueryClient();
  const print = usePrintBill();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const printById = async (id: string) => {
    setLoadingId(id);
    try {
      const bill = await queryClient.fetchQuery({ queryKey: queryKeys.bill(id), queryFn: () => services.bills.get(id), staleTime: 60_000 });
      print(bill);
    } catch (error) {
      toast.error(toAppError(error).userMessage);
    } finally {
      setLoadingId(null);
    }
  };
  return { printById, loadingId };
}

/** Soft-deletes a bill after asking for a reason. It stays visible as "Cancelled". */
export function useCancelBill() {
  const services = useServices();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const mutation = useMutation({
    mutationFn: ({ bill, reason }: { bill: Pick<BillHeader, '_id' | 'version'>; reason: string }) =>
      services.bills.cancel(bill._id, reason, bill.version),
    onSuccess: (bill) => {
      queryClient.setQueryData(queryKeys.bill(bill._id), bill);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bills });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success(`Bill ${bill.billNumber} cancelled`);
    },
  });
  const cancelBill = async (bill: Pick<BillHeader, '_id' | 'version' | 'billNumber' | 'grandTotal'>) => {
    const reason = await confirm({
      title: `Cancel bill ${bill.billNumber}?`,
      tone: 'danger',
      confirmLabel: 'Cancel bill',
      cancelLabel: 'Keep bill',
      description:
        'The bill is kept for the record with status “Cancelled” and excluded from sales and reports. Its number is never reused. This cannot be undone.',
      input: { label: 'Reason', placeholder: 'e.g. Entered for the wrong store', required: true },
    });
    if (reason === false) return;
    await mutation.mutateAsync({ bill, reason }).catch(() => undefined);
  };
  return { cancelBill, cancelling: mutation.isPending };
}
