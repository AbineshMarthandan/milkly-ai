import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { toAppError } from '@/domain/errors/AppError';
import type { BillHeader, BillStatus } from '@/domain/models';
import { queryKeys } from '@/constants/queryKeys';
import { usePrintBill } from '@/components/billing/PrintProvider';
import { useConfirm } from '@/components/modals/ConfirmProvider';
import { usePermission, useServices } from '@/hooks/useSession';

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

/**
 * Marks a bill invalid after asking for a reason. It stays on record (shown as
 * "Invalid"), keeps its number and is excluded from sales and reports. This is
 * also how a bill from an earlier day is corrected: mark it invalid, then
 * re-bill the store today (offered right after).
 */
export function useMarkInvalid() {
  const services = useServices();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const canCreate = usePermission('bill:create');
  const mutation = useMutation({
    mutationFn: ({ bill, reason }: { bill: Pick<BillHeader, '_id' | 'version'>; reason: string }) =>
      services.bills.markInvalid(bill._id, reason, bill.version),
    onSuccess: (bill) => {
      queryClient.setQueryData(queryKeys.bill(bill._id), bill);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bills });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success(`Bill ${bill.billNumber} marked invalid`, {
        description: canCreate ? 'Need a corrected bill? Create a new one for this store today.' : undefined,
        action: canCreate
          ? {
              label: 'Re-bill today',
              onClick: () =>
                navigate(
                  `/billing/new?route=${encodeURIComponent(bill.routeId)}&customer=${encodeURIComponent(bill.customerId)}&copy=${encodeURIComponent(bill._id)}`,
                ),
            }
          : undefined,
        duration: 10_000,
      });
    },
  });
  const markInvalid = async (bill: Pick<BillHeader, '_id' | 'version' | 'billNumber' | 'grandTotal'>) => {
    const reason = await confirm({
      title: `Mark bill ${bill.billNumber} as invalid?`,
      tone: 'danger',
      confirmLabel: 'Mark as invalid',
      cancelLabel: 'Keep bill',
      description:
        'The bill stays on record marked “Invalid” with your reason, and is excluded from sales and reports. Its number is never reused. This cannot be undone. To correct it, create a new bill today.',
      input: { label: 'Reason', placeholder: 'e.g. Wrong quantities entered', required: true },
    });
    if (reason === false) return;
    await mutation.mutateAsync({ bill, reason }).catch(() => undefined);
  };
  return { markInvalid, marking: mutation.isPending };
}
