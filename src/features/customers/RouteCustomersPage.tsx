import { FilePlus2, FolderOpen, Plus, Store } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Customer } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { AddTile, Breadcrumbs, CardGrid, GridSkeleton } from '@/components/explorer/Explorer';
import { useCan } from '@/hooks/useSession';
import { applyFilters, customerText, plural, useRouteBook } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { CustomerCard } from './CustomerCard';
import { CustomerFormDrawer } from './CustomerFormDrawer';

/** One route's folder in Customers: its store cards in delivery (priority) order. */
export default function RouteCustomersPage() {
  const { routeId = '' } = useParams();
  const can = useCan();
  const canManage = can('customer:manage');
  const book = useRouteBook();
  const setActive = useSetActive('customers');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Customer>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');

  const route = book.routeById.get(routeId);
  if (book.isLoading) return <GridSkeleton />;
  if (book.error) return <ErrorState error={book.error} onRetry={() => void book.refetch()} />;
  if (!route) {
    return (
      <EmptyState
        className="py-24"
        title="Route not found"
        action={
          <Link to="/masters/customers">
            <Button variant="secondary">Back to customers</Button>
          </Link>
        }
      />
    );
  }

  const all = book.customersOf(route._id);
  const stores = applyFilters(all, status, search, customerText);
  const canAdd = canManage && route.isActive;
  const showAddTile = canAdd && status !== 'inactive' && !search;

  return (
    <>
      <Breadcrumbs items={[{ label: 'Customers', to: '/masters/customers' }, { label: route.routeName }]} />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <FolderOpen className={`size-7 ${book.accentOf(route._id).icon}`} aria-hidden />
            {route.routeName}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-600">{route.routeCode}</span>
          </span>
        }
        description={`${plural(all.filter((store) => store.isActive).length, 'store')} in delivery order${route.isActive ? '' : ' · route inactive'}`}
        actions={
          <>
            {can('bill:create') && route.isActive && (
              <Link to={`/billing/new?route=${encodeURIComponent(route._id)}`}>
                <Button variant="secondary" icon={<FilePlus2 className="size-4" />}>
                  Bill this route
                </Button>
              </Link>
            )}
            {canAdd && (
              <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
                Add store
              </Button>
            )}
          </>
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder={`Search ${route.routeName} stores…`}>
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {stores.length === 0 && !showAddTile ? (
        <EmptyState icon={<Store className="size-6" />} title={search ? 'No stores match your search' : 'No stores here'} />
      ) : (
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
          {showAddTile && <AddTile label="New store" onClick={drawer.create} />}
        </CardGrid>
      )}

      <CustomerFormDrawer open={drawer.open} customer={drawer.item} defaultRouteId={route._id} onClose={drawer.close} />
    </>
  );
}
