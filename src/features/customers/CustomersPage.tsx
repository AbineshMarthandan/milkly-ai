import { Plus, Store } from 'lucide-react';
import { useState } from 'react';
import type { Customer } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { CardGrid, FolderTile, GridSkeleton } from '@/components/explorer/Explorer';
import { useCan } from '@/hooks/useSession';
import { applyFilters, customerText, plural, useRouteBook } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { filterByStatus, useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { CustomerCard } from './CustomerCard';
import { CustomerFormDrawer } from './CustomerFormDrawer';

/**
 * Stores, foldered by route: each route is a folder that opens to its store
 * cards in delivery order. Typing in search lists matching stores across routes.
 */
export default function CustomersPage() {
  const can = useCan();
  const canManage = can('customer:manage');
  const book = useRouteBook();
  const setActive = useSetActive('customers');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Customer>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');

  const searching = search.trim().length > 0;
  const results = searching
    ? book.routes.flatMap((route) => applyFilters(book.customersOf(route._id), status, search, customerText).map((customer) => ({ route, customer })))
    : [];
  const folders = (status === 'active' ? book.routes.filter((route) => route.isActive) : book.routes)
    .map((route) => ({ route, stores: filterByStatus(book.customersOf(route._id), status) }))
    .filter(({ stores }) => status !== 'inactive' || stores.length > 0);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Open a route to see its stores in delivery order."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
              Add store
            </Button>
          )
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder="Search all stores, contacts, phone…">
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {book.isLoading ? (
        <GridSkeleton />
      ) : book.error ? (
        <ErrorState error={book.error} onRetry={() => void book.refetch()} />
      ) : searching ? (
        results.length === 0 ? (
          <EmptyState icon={<Store className="size-6" />} title="No stores match your search" />
        ) : (
          <CardGrid>
            {results.map(({ route, customer }) => (
              <CustomerCard
                key={customer._id}
                customer={customer}
                context={`${route.routeName} (${route.routeCode})`}
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
        )
      ) : folders.length === 0 ? (
        <EmptyState icon={<Store className="size-6" />} title={status === 'inactive' ? 'No inactive stores' : 'No routes yet'} />
      ) : (
        <CardGrid>
          {folders.map(({ route, stores }) => (
            <FolderTile
              key={route._id}
              name={route.routeName}
              to={`/masters/customers/${route._id}`}
              accent={book.accentOf(route._id)}
              badge={route.routeCode}
              meta={plural(stores.length, status === 'inactive' ? 'inactive store' : 'store')}
              inactive={!route.isActive}
            />
          ))}
        </CardGrid>
      )}

      <CustomerFormDrawer open={drawer.open} customer={drawer.item} onClose={drawer.close} />
    </>
  );
}
