import { MapPinned, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Route } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { AddTile, CardGrid, GridSkeleton, ItemCard } from '@/components/explorer/Explorer';
import { usePermission } from '@/hooks/useSession';
import { formatDate } from '@/utils/format';
import { applyFilters, routeText, useRouteBook } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { RouteFormDrawer } from './RouteFormDrawer';

/** Delivery routes as cards, in priority order. */
export default function RoutesPage() {
  const canManage = usePermission('route:manage');
  const book = useRouteBook();
  const setActive = useSetActive('routes');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Route>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');

  const routes = applyFilters(book.routes, status, search, routeText);
  const showAddTile = canManage && status !== 'inactive' && !search;

  return (
    <>
      <PageHeader
        title="Routes"
        description="Delivery routes. The route code is printed on bills; priority sets the route order."
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
      ) : routes.length === 0 && !showAddTile ? (
        <EmptyState icon={<MapPinned className="size-6" />} title={search ? 'No routes match your search' : 'No routes here'} />
      ) : (
        <CardGrid>
          {routes.map((route) => (
            <ItemCard
              key={route._id}
              name={route.routeName}
              title={
                <span className="flex items-center gap-2.5">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${book.accentOf(route._id).tile}`}>
                    <MapPinned className={`size-5 ${book.accentOf(route._id).icon}`} aria-hidden />
                  </span>
                  <span className="truncate">{route.routeName}</span>
                </span>
              }
              badge={<span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600">{route.routeCode}</span>}
              inactive={!route.isActive}
              onOpen={canManage ? () => drawer.edit(route) : undefined}
              actions={entityActions({
                entityLabel: 'route',
                name: route.routeName,
                isActive: route.isActive,
                canManage,
                onEdit: () => drawer.edit(route),
                onSetActive: (active) => setActive.mutateAsync({ entity: route, active }),
                deleteNote: <p className="text-xs text-slate-500">Its stores stay assigned but the route can’t be picked for new bills.</p>,
              })}
              footer={
                <>
                  <span className="font-mono">{route._id}</span>
                  <span>
                    Priority #{route.priority} · Updated {formatDate(route.updatedAt.slice(0, 10))}
                  </span>
                </>
              }
            />
          ))}
          {showAddTile && <AddTile label="New route" onClick={drawer.create} className="min-h-0 flex-row py-5" />}
        </CardGrid>
      )}

      <RouteFormDrawer open={drawer.open} route={drawer.item} onClose={drawer.close} />
    </>
  );
}
