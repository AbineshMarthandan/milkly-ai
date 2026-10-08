import { FilePlus2, FolderOpen, Pencil, Plus, Store } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Customer } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { AddTile, Breadcrumbs, CardGrid, GridSkeleton } from '@/components/explorer/Explorer';
import { useCan } from '@/hooks/useSession';
import { CustomerCard } from '../customers/CustomerCard';
import { CustomerFormDrawer } from '../customers/CustomerFormDrawer';
import { applyFilters, customerText, plural, useRouteBook } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { RouteFormDrawer } from './RouteFormDrawer';

/** Inside a route folder: its stores as cards, in delivery (priority) order. */
export default function RouteFolderPage() {
  const { routeId = '' } = useParams();
  const can = useCan();
  const book = useRouteBook();
  const entityActions = useEntityActions();
  const setCustomerActive = useSetActive('customers');
  const routeDrawer = useDrawer<null>();
  const customerDrawer = useDrawer<Customer>();
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
        description="It may have been removed or the link is wrong."
        action={
          <Link to="/masters/routes">
            <Button variant="secondary">Back to routes</Button>
          </Link>
        }
      />
    );
  }

  const canManageCustomers = can('customer:manage');
  const allStores = book.customersOf(route._id);
  const stores = applyFilters(allStores, status, search, customerText);

  return (
    <>
      <Breadcrumbs items={[{ label: 'Routes', to: '/masters/routes' }, { label: route.routeName }]} />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <FolderOpen className={`size-7 ${book.accentOf(route._id).icon}`} aria-hidden />
            {route.routeName}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-600">{route.routeCode}</span>
            {!route.isActive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Inactive</span>}
          </span>
        }
        description={`${route._id} · Priority #${route.priority} · ${plural(allStores.filter((s) => s.isActive).length, 'store')}`}
        actions={
          <>
            {can('route:manage') && (
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => routeDrawer.create()}>
                Edit route
              </Button>
            )}
            {can('bill:create') && route.isActive && (
              <Link to={`/billing/new?route=${encodeURIComponent(route._id)}`}>
                <Button variant="secondary" icon={<FilePlus2 className="size-4" />}>
                  Bill this route
                </Button>
              </Link>
            )}
            {canManageCustomers && route.isActive && (
              <Button icon={<Plus className="size-4" />} onClick={customerDrawer.create}>
                Add store
              </Button>
            )}
          </>
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder={`Search ${route.routeName}…`}>
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {stores.length === 0 && !(canManageCustomers && route.isActive && !search) ? (
        <EmptyState icon={<Store className="size-6" />} title={search ? 'No stores match your search' : 'No stores on this route'} />
      ) : (
        <CardGrid>
          {stores.map((customer) => (
            <CustomerCard
              key={customer._id}
              customer={customer}
              vendorNames={book.vendorNamesOf(customer)}
              canBill={can('bill:create') && route.isActive}
              onOpen={canManageCustomers ? () => customerDrawer.edit(customer) : undefined}
              actions={entityActions({
                entityLabel: 'store',
                name: customer.storeName,
                isActive: customer.isActive,
                canManage: canManageCustomers,
                onEdit: () => customerDrawer.edit(customer),
                onSetActive: (active) => setCustomerActive.mutateAsync({ entity: customer, active }),
              })}
            />
          ))}
          {canManageCustomers && route.isActive && status !== 'inactive' && !search && <AddTile label="New store" onClick={customerDrawer.create} />}
        </CardGrid>
      )}

      <RouteFormDrawer open={routeDrawer.open} route={route} onClose={routeDrawer.close} />
      <CustomerFormDrawer open={customerDrawer.open} customer={customerDrawer.item} defaultRouteId={route._id} onClose={customerDrawer.close} />
    </>
  );
}
