import { createColumnHelper } from '@tanstack/react-table';
import { MapPinned, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Route } from '@/domain/models';
import { sortByPriority } from '@/domain/services/ordering';
import { Button } from '@/components/common/Button';
import { Card, PageHeader, StatusBadge } from '@/components/common/Layout';
import { DataTable } from '@/components/tables/DataTable';
import { usePermission } from '@/hooks/useSession';
import { IdCell, RowActions, StatusFilter } from '../shared/MasterComponents';
import { filterByStatus, useMasterList, useSetActive, type StatusFilterValue } from '../shared/masterData';
import { RouteFormDrawer } from './RouteFormDrawer';

const column = createColumnHelper<Route & { customerCount: number }>();

export default function RoutesPage() {
  const canManage = usePermission('route:manage');
  const routes = useMasterList('routes');
  const { data: customers = [] } = useMasterList('customers');
  const setActive = useSetActive('routes');
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [editing, setEditing] = useState<Route | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openEditor = (route: Route | null) => {
    setEditing(route);
    setDrawerOpen(true);
  };

  const rows = useMemo(
    () =>
      sortByPriority(filterByStatus(routes.data ?? [], status), (route) => route.routeName).map((route) => ({
        ...route,
        customerCount: customers.filter((customer) => customer.routeId === route._id && customer.isActive).length,
      })),
    [routes.data, customers, status],
  );

  const columns = useMemo(
    () => [
      column.accessor('priority', { header: 'Priority', meta: { className: 'w-20' } }),
      column.accessor('routeCode', {
        header: 'Code',
        cell: (info) => (
          <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-700 ring-1 ring-slate-500/10 ring-inset">
            {info.getValue()}
          </span>
        ),
      }),
      column.accessor('routeName', {
        header: 'Route',
        cell: (info) => <span className="font-medium text-slate-900">{info.getValue()}</span>,
      }),
      column.accessor('_id', { header: 'Route ID', cell: (info) => <IdCell id={info.getValue()} />, meta: { hideOnMobile: true } }),
      column.accessor('customerCount', { header: 'Customers', meta: { align: 'right', hideOnMobile: true } }),
      column.accessor('isActive', { header: 'Status', cell: (info) => <StatusBadge active={info.getValue()} /> }),
      column.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            entityLabel="route"
            name={row.original.routeName}
            isActive={row.original.isActive}
            canManage={canManage}
            onEdit={() => openEditor(row.original)}
            onSetActive={(active) => setActive.mutateAsync({ entity: row.original, active })}
            deleteNote={<p className="text-xs text-slate-500">Its customers can no longer be billed until the route is restored.</p>}
          />
        ),
      }),
    ],
    [canManage, setActive],
  );

  return (
    <>
      <PageHeader
        title="Routes"
        description="Delivery routes that group your customers. Priority sets the order of routes when billing."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={() => openEditor(null)}>
              Add route
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          data={rows}
          columns={columns}
          loading={routes.isLoading}
          error={routes.error}
          onRetry={() => void routes.refetch()}
          searchPlaceholder="Search routes…"
          toolbar={<StatusFilter value={status} onChange={setStatus} />}
          getRowId={(route) => route._id}
          rowClassName={(route) => (route.isActive ? undefined : 'opacity-60')}
          emptyTitle={status === 'inactive' ? 'No inactive routes' : 'No routes yet'}
          emptyDescription="Add the delivery routes you serve, such as North Market or R-A."
          emptyAction={
            canManage && status !== 'inactive' ? (
              <Button icon={<MapPinned className="size-4" />} onClick={() => openEditor(null)}>
                Add your first route
              </Button>
            ) : undefined
          }
        />
      </Card>
      <RouteFormDrawer open={drawerOpen} route={editing} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
