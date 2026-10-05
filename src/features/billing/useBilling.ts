import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { BillLine, Customer, EntityId } from '@/domain/models';
import type { BillDraftInput } from '@/domain/services';
import { buildBillVendors } from '@/domain/services/billing/billDocument';
import { calculateTotals } from '@/domain/services/billing/calculations';
import { buildCatalog, type CatalogVendor } from '@/domain/services/billing/catalog';
import { queryKeys } from '@/constants/queryKeys';
import { useServices } from '@/hooks/useSession';
import { useMasterList } from '../shared/masterData';

/** The priority-ordered vendor → category → product catalogue for a customer. */
export function useBillingCatalog(customer: Customer | null, lockedLines?: readonly BillLine[]) {
  const vendors = useMasterList('vendors');
  const categories = useMasterList('categories');
  const products = useMasterList('products');
  const catalog = useMemo<CatalogVendor[]>(
    () =>
      customer
        ? buildCatalog({
            vendors: vendors.data ?? [],
            categories: categories.data ?? [],
            products: products.data ?? [],
            customer,
            lockedLines,
          })
        : [],
    [customer, vendors.data, categories.data, products.data, lockedLines],
  );
  return {
    catalog,
    isLoading: vendors.isLoading || categories.isLoading || products.isLoading,
    error: vendors.error ?? categories.error ?? products.error,
    refetch: () => Promise.all([vendors.refetch(), categories.refetch(), products.refetch()]),
  };
}

/** Live totals for the draft — the same domain functions the service uses on save. */
export function useDraftTotals(catalog: readonly CatalogVendor[], quantities: Record<EntityId, number>) {
  return useMemo(() => {
    const vendors = buildBillVendors(catalog, quantities);
    return { vendors, totals: calculateTotals(vendors) };
  }, [catalog, quantities]);
}

function useInvalidateBills() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bills });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
  };
}

export function useFinalizeBill() {
  const services = useServices();
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: (input: BillDraftInput) => services.bills.finalize(input),
    onSuccess: invalidate,
  });
}

export function useUpdateBill() {
  const services = useServices();
  const invalidate = useInvalidateBills();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input, version }: { id: EntityId; input: BillDraftInput; version: number }) =>
      services.bills.update(id, input, version),
    onSuccess: (bill) => {
      queryClient.setQueryData(queryKeys.bill(bill._id), bill);
      invalidate();
    },
  });
}

export function useBill(id: EntityId | undefined) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.bill(id ?? ''),
    queryFn: () => services.bills.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
