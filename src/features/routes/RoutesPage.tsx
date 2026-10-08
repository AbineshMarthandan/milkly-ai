import { MapPinned, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Route } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { AddTile, CardGrid, FolderTile, GridSkeleton } from '@/components/explorer/Explorer';
import { usePermission } from '@/hooks/useSession';
import { applyFilters, plural, routeText, useRouteBook } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { RouteFormDrawer } from './RouteFormDrawer';

/** Delivery routes as folders. Opening one shows its stores in delivery order. */
export default function RoutesPage() {
  const canManage = usePermission('route:manage');
  const book = useRouteBook();
  const setActive = useSetActive('routes');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Route>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');

  const routes = applyFilters(book.routes, status, search, routeText);

  return (
    <>
      <PageHeader
        title="Routes"
        description="Each delivery route is a folder of stores. Open one to see its stores in delivery order."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
              Add route
            </Button>
          )
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder="Search routes…">
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {book.isLoading ? (
        <GridSkeleton />
      ) : book.error ? (
        <ErrorState error={book.error} onRetry={() => void book.refetch()} />
      ) : routes.length === 0 && !(canManage && status !== 'inactive' && !search) ? (
        <EmptyState icon={<MapPinned className="size-6" />} title={search ? 'No routes match your search' : 'No routes here'} />
      ) : (
        <CardGrid>
          {routes.map((route) => {
            const stores = book.customersOf(route._id).filter((customer) => customer.isActive);
            return (
              <FolderTile
                key={route._id}
                name={route.routeName}
                to={`/masters/routes/${route._id}`}
                accent={book.accentOf(route._id)}
                badge={route.routeCode}
                meta={`${plural(stores.length, 'store')} · Priority #${route.priority}`}
                inactive={!route.isActive}
                actions={entityActions({
                  entityLabel: 'route',
                  name: route.routeName,
                  isActive: route.isActive,
                  canManage,
                  onEdit: () => drawer.edit(route),
                  onSetActive: (active) => setActive.mutateAsync({ entity: route, active }),
                  deleteNote: <p className="text-xs text-slate-500">Its stores stay assigned but the route can’t be picked for new bills.</p>,
                })}
              >
                <ol className="space-y-0.5 text-xs text-slate-500">
                  {stores.slice(0, 3).map((store) => (
                    <li key={store._id} className="truncate">
                      {store.priority}. {store.storeName}
                    </li>
                  ))}
                  {stores.length > 3 && <li className="text-slate-400">+{stores.length - 3} more</li>}
                </ol>
              </FolderTile>
            );
          })}
          {canManage && status !== 'inactive' && !search && <AddTile folder label="New route" onClick={drawer.create} />}
        </CardGrid>
      )}

      <RouteFormDrawer open={drawer.open} route={drawer.item} onClose={drawer.close} />
    </>
  );
}
