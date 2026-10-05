import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { toAppError } from '@/domain/errors/AppError';
import type { Category, Customer, EntityId, Product, Route, Vendor } from '@/domain/models';
import type { AppServices } from '@/domain/services';
import type {
  CategoryFormValues,
  CustomerFormValues,
  ProductFormValues,
  RouteFormValues,
  VendorFormValues,
} from '@/domain/validation/schemas';
import { queryKeys } from '@/constants/queryKeys';
import { useServices } from '@/hooks/useSession';

interface MasterTypes {
  vendors: { entity: Vendor; form: VendorFormValues };
  categories: { entity: Category; form: CategoryFormValues };
  products: { entity: Product; form: ProductFormValues };
  routes: { entity: Route; form: RouteFormValues };
  customers: { entity: Customer; form: CustomerFormValues };
}
export type MasterKey = keyof MasterTypes;
export type MasterEntity<K extends MasterKey> = MasterTypes[K]['entity'];
export type MasterForm<K extends MasterKey> = MasterTypes[K]['form'];

/** The common shape every master-data service exposes. */
interface MasterService<K extends MasterKey> {
  list(): Promise<MasterEntity<K>[]>;
  create(values: MasterForm<K>): Promise<MasterEntity<K>>;
  update(id: EntityId, values: MasterForm<K>, expectedVersion?: number): Promise<MasterEntity<K>>;
  deactivate(id: EntityId, expectedVersion?: number): Promise<MasterEntity<K>>;
  reactivate(id: EntityId, expectedVersion?: number): Promise<MasterEntity<K>>;
}

function serviceFor<K extends MasterKey>(services: AppServices, key: K): MasterService<K> {
  return services[key] as unknown as MasterService<K>;
}

/** Cached list of one master collection (shared by every screen that needs it). */
export function useMasterList<K extends MasterKey>(key: K) {
  const services = useServices();
  return useQuery({ queryKey: queryKeys[key], queryFn: () => serviceFor(services, key).list() });
}

/** `id → entity` lookup over a cached master list. */
export function useLookup<K extends MasterKey>(key: K): Map<EntityId, MasterEntity<K>> {
  const { data } = useMasterList(key);
  return useMemo(() => new Map((data ?? []).map((entity) => [entity._id, entity])), [data]);
}

export interface SaveVariables<K extends MasterKey> {
  id?: EntityId;
  values: MasterForm<K>;
  version?: number;
}

/** Create or update; refreshes the list and dashboard counts. */
export function useSaveMaster<K extends MasterKey>(key: K) {
  const services = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, values, version }: SaveVariables<K>) =>
      id ? serviceFor(services, key).update(id, values, version) : serviceFor(services, key).create(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys[key] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

/** Soft delete (deactivate) or reactivate. */
export function useSetActive<K extends MasterKey>(key: K) {
  const services = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entity, active }: { entity: MasterEntity<K>; active: boolean }) =>
      active
        ? serviceFor(services, key).reactivate(entity._id, entity.version)
        : serviceFor(services, key).deactivate(entity._id, entity.version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys[key] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

/**
 * Maps service validation errors onto form fields. Errors without a matching
 * field are shown as a toast.
 */
export function handleFormError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly string[]) {
  const appError = toAppError(error);
  let shown = false;
  for (const [field, message] of Object.entries(appError.fieldErrors ?? {})) {
    if (fields.includes(field)) {
      setError(field as Path<T>, { type: 'server', message });
      shown = true;
    }
  }
  if (!shown) toast.error(appError.userMessage);
}

/** Next free priority for a new record (max + 1). */
export function nextPriority(items: readonly { priority: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.priority), 0) + 1;
}

export type StatusFilterValue = 'active' | 'inactive' | 'all';

export function filterByStatus<T extends { isActive: boolean }>(items: readonly T[], status: StatusFilterValue): T[] {
  if (status === 'all') return [...items];
  return items.filter((item) => item.isActive === (status === 'active'));
}
