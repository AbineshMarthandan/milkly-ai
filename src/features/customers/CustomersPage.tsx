import { Plus, Store } from 'lucide-react';
import { useState } from 'react';
import type { Customer } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { CardGrid, GridSkeleton, SectionHeading } from '@/components/explorer/Explorer';
import { Combobox } from '@/components/forms/Combobox';
import { useCan } from '@/hooks/useSession';
import { applyFilters, customerText, useRouteBook } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { CustomerCard } from './CustomerCard';
import { CustomerFormDrawer } from './CustomerFormDrawer';

/** Every store as a card, grouped by route in delivery order. */
export default function CustomersPage() {
  const can = useCan();
  const canManage = can('customer:manage');
  const book = useRouteBook();
  const setActive = useSetActive('customers');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Customer>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');
  const [routeId, setRouteId] = useState<string | null>(null);

  const groups = book.routes
    .filter((route) => !routeId || route._id === routeId)
    .map((route) => ({ route, stores: applyFilters(book.customersOf(route._id), status, search, customerText) }))
    .filter((group) => group.stores.length > 0);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Stores grouped by route, in delivery order. Open a route folder to manage its stores together."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
              Add store
            </Button>
          )
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder="Search stores, contacts, phone…">
        <Combobox
          className="sm:w-56"
          options={book.routes.map((route) => ({ value: route._id, label: route.routeName, meta: route.routeCode }))}
          value={routeId}
          onChange={setRouteId}
          placeholder="All routes"
          clearable
        />
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {book.isLoading ? (
        <GridSkeleton />
      ) : book.error ? (
        <ErrorState error={book.error} onRetry={() => void book.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<Store className="size-6" />} title={search ? 'No stores match your search' : 'No stores here'} />
      ) : (
        groups.map(({ route, stores }) => (
          <section key={route._id} className="mb-8">
            <SectionHeading
              title={
                <>
                  {route.routeName}
                  <span className="ml-2 font-mono text-xs font-normal text-slate-400">{route.routeCode}</span>
                </>
              }
              count={stores.length}
              to={`/masters/routes/${route._id}`}
            />
            <CardGrid>
              {stores.map((customer) => (
                <CustomerCard
                  key={customer._id}
                  customer={customer}
                  vendorNames={book.vendorNamesOf(customer)}
                  canBill={can('bill:create') && route.isActive}
                  onOpen={canManage ? () => drawer.edit(customer) : undefined}
                  actions={entityActions({
                    entityLabel: 'store',
                    name: customer.storeName,
                    isActive: customer.isActive,
                    canManage,
                    onEdit: () => drawer.edit(customer),
                    onSetActive: (active) => setActive.mutateAsync({ entity: customer, active }),
                  })}
                />
              ))}
            </CardGrid>
          </section>
        ))
      )}

      <CustomerFormDrawer open={drawer.open} customer={drawer.item} defaultRouteId={routeId} onClose={drawer.close} />
    </>
  );
}
