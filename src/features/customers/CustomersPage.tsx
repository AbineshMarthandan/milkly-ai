import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Store } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Customer, EntityId } from '@/domain/models';
import { sortByPriority } from '@/domain/services/ordering';
import { Button } from '@/components/common/Button';
import { Card, PageHeader, StatusBadge } from '@/components/common/Layout';
import { Combobox, type ComboOption } from '@/components/forms/Combobox';
import { DataTable } from '@/components/tables/DataTable';
import { usePermission } from '@/hooks/useSession';
import { IdCell, RowActions, StatusFilter } from '../shared/MasterComponents';
import { filterByStatus, useMasterList, useSetActive, type StatusFilterValue } from '../shared/masterData';
import { CustomerFormDrawer } from './CustomerFormDrawer';

const column = createColumnHelper<Customer & { routeName: string; routeCode: string; vendorNames: string }>();

export default function CustomersPage() {
  const canManage = usePermission('customer:manage');
  const customers = useMasterList('customers');
  const { data: routes = [] } = useMasterList('routes');
  const { data: vendors = [] } = useMasterList('vendors');
  const setActive = useSetActive('customers');
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [routeId, setRouteId] = useState<EntityId | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openEditor = (customer: Customer | null) => {
    setEditing(customer);
    setDrawerOpen(true);
  };

  // Every route (inactive ones too), so inactive customers can still be found.
  const routeOptions = useMemo<ComboOption[]>(
    () =>
      sortByPriority(routes, (route) => route.routeName).map((route) => ({
        value: route._id,
        label: route.routeName,
        description: route.isActive ? undefined : 'Inactive',
        meta: route.routeCode,
      })),
    [routes],
  );

  // Delivery order: route priority first, then customer priority inside the route.
  const rows = useMemo(() => {
    const routeById = new Map(routes.map((route) => [route._id, route]));
    const vendorById = new Map(vendors.map((vendor) => [vendor._id, vendor]));
    const routeRank = new Map(sortByPriority(routes, (route) => route.routeName).map((route, index) => [route._id, index]));
    const rankOf = (id: EntityId) => routeRank.get(id) ?? Number.MAX_SAFE_INTEGER;
    const visible = filterByStatus(customers.data ?? [], status).filter((customer) => !routeId || customer.routeId === routeId);
    return sortByPriority(visible, (customer) => customer.storeName)
      .sort((a, b) => rankOf(a.routeId) - rankOf(b.routeId))
      .map((customer) => ({
        ...customer,
        routeName: routeById.get(customer.routeId)?.routeName ?? customer.routeId,
        routeCode: routeById.get(customer.routeId)?.routeCode ?? '',
        // Empty means "all active vendors".
        vendorNames: sortByPriority(
          customer.vendorIds.flatMap((id) => vendorById.get(id) ?? []),
          (vendor) => vendor.vendorName,
        )
          .map((vendor) => vendor.vendorName)
          .join(', '),
      }));
  }, [customers.data, routes, vendors, status, routeId]);

  const columns = useMemo(
    () => [
      column.accessor('priority', { header: 'Priority', meta: { className: 'w-20' } }),
      column.accessor((customer) => `${customer.storeName} ${customer._id}`, {
        id: 'store',
        header: 'Store',
        cell: ({ row }) => (
          <div className="min-w-36">
            <div className="font-medium text-slate-900">{row.original.storeName}</div>
            <IdCell id={row.original._id} />
          </div>
        ),
      }),
      column.accessor((customer) => [customer.contactPerson, customer.phone].filter(Boolean).join(' '), {
        id: 'contact',
        header: 'Contact',
        cell: ({ row }) =>
          row.original.contactPerson || row.original.phone ? (
            <div>
              {row.original.contactPerson && <div>{row.original.contactPerson}</div>}
              {row.original.phone && <div className="text-xs text-slate-500">{row.original.phone}</div>}
            </div>
          ) : (
            <span className="text-slate-400">—</span>
          ),
        meta: { hideOnMobile: true },
      }),
      column.accessor((customer) => `${customer.routeName} ${customer.routeCode}`, {
        id: 'route',
        header: 'Route',
        cell: ({ row }) => (
          <div>
            <div>{row.original.routeName}</div>
            {row.original.routeCode && <div className="font-mono text-xs text-slate-500">{row.original.routeCode}</div>}
          </div>
        ),
      }),
      column.accessor('vendorNames', {
        header: 'Vendors',
        cell: (info) => info.getValue() || <span className="text-slate-400">All vendors</span>,
        meta: { hideOnMobile: true, className: 'max-w-64' },
      }),
      column.accessor('isActive', { header: 'Status', cell: (info) => <StatusBadge active={info.getValue()} /> }),
      column.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            entityLabel="customer"
            name={row.original.storeName}
            isActive={row.original.isActive}
            canManage={canManage}
            onEdit={() => openEditor(row.original)}
            onSetActive={(active) => setActive.mutateAsync({ entity: row.original, active })}
            deleteNote={<p className="text-xs text-slate-500">The store can no longer be selected for new bills.</p>}
          />
        ),
      }),
    ],
    [canManage, setActive],
  );

  return (
    <>
      <PageHeader
        title="Customers"
        description="Stores you deliver to, listed by route. Priority sets the delivery order of stores within their route."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={() => openEditor(null)}>
              Add customer
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          data={rows}
          columns={columns}
          loading={customers.isLoading}
          error={customers.error}
          onRetry={() => void customers.refetch()}
          searchPlaceholder="Search customers…"
          toolbar={
            <>
              <label htmlFor="customer-route-filter" className="sr-only">
                Filter by route
              </label>
              <Combobox
                id="customer-route-filter"
                options={routeOptions}
                value={routeId}
                onChange={setRouteId}
                clearable
                placeholder="All routes"
                className="sm:w-56"
              />
              <StatusFilter value={status} onChange={setStatus} />
            </>
          }
          getRowId={(customer) => customer._id}
          rowClassName={(customer) => (customer.isActive ? undefined : 'opacity-60')}
          emptyTitle={status === 'inactive' ? 'No inactive customers' : routeId ? 'No customers on this route' : 'No customers yet'}
          emptyDescription="Add the stores you deliver to and assign each one to a route."
          emptyAction={
            canManage && status !== 'inactive' ? (
              <Button icon={<Store className="size-4" />} onClick={() => openEditor(null)}>
                Add a customer
              </Button>
            ) : undefined
          }
        />
      </Card>
      <CustomerFormDrawer open={drawerOpen} customer={editing} defaultRouteId={routeId} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
