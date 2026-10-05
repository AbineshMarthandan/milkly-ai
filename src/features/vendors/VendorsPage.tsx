import { createColumnHelper } from '@tanstack/react-table';
import { Building2, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Vendor } from '@/domain/models';
import { sortByPriority } from '@/domain/services/ordering';
import { Button } from '@/components/common/Button';
import { Card, PageHeader, StatusBadge } from '@/components/common/Layout';
import { DataTable } from '@/components/tables/DataTable';
import { usePermission } from '@/hooks/useSession';
import { formatDateTime } from '@/utils/format';
import { IdCell, RowActions, StatusFilter } from '../shared/MasterComponents';
import { filterByStatus, useMasterList, useSetActive, type StatusFilterValue } from '../shared/masterData';
import { VendorFormDrawer } from './VendorFormDrawer';

const column = createColumnHelper<Vendor & { categoryCount: number; productCount: number }>();

export default function VendorsPage() {
  const canManage = usePermission('vendor:manage');
  const vendors = useMasterList('vendors');
  const { data: categories = [] } = useMasterList('categories');
  const { data: products = [] } = useMasterList('products');
  const setActive = useSetActive('vendors');
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openEditor = (vendor: Vendor | null) => {
    setEditing(vendor);
    setDrawerOpen(true);
  };

  const rows = useMemo(
    () =>
      sortByPriority(filterByStatus(vendors.data ?? [], status), (vendor) => vendor.vendorName).map((vendor) => ({
        ...vendor,
        categoryCount: categories.filter((category) => category.vendorId === vendor._id && category.isActive).length,
        productCount: products.filter((product) => product.vendorId === vendor._id && product.isActive).length,
      })),
    [vendors.data, categories, products, status],
  );

  const columns = useMemo(
    () => [
      column.accessor('priority', { header: 'Priority', meta: { className: 'w-20' } }),
      column.accessor('vendorName', {
        header: 'Vendor',
        cell: (info) => <span className="font-medium text-slate-900">{info.getValue()}</span>,
      }),
      column.accessor('_id', { header: 'Vendor ID', cell: (info) => <IdCell id={info.getValue()} /> }),
      column.accessor('categoryCount', { header: 'Categories', meta: { align: 'right', hideOnMobile: true } }),
      column.accessor('productCount', { header: 'Products', meta: { align: 'right', hideOnMobile: true } }),
      column.accessor('isActive', { header: 'Status', cell: (info) => <StatusBadge active={info.getValue()} /> }),
      column.accessor('updatedAt', {
        header: 'Updated',
        cell: (info) => <span className="text-xs text-slate-500">{formatDateTime(info.getValue())}</span>,
        meta: { hideOnMobile: true },
      }),
      column.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            entityLabel="vendor"
            name={row.original.vendorName}
            isActive={row.original.isActive}
            canManage={canManage}
            onEdit={() => openEditor(row.original)}
            onSetActive={(active) => setActive.mutateAsync({ entity: row.original, active })}
            deleteNote={<p className="text-xs text-slate-500">Its categories and products will no longer appear on new bills.</p>}
          />
        ),
      }),
    ],
    [canManage, setActive],
  );

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Suppliers whose products you distribute. Priority sets their order on every bill."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={() => openEditor(null)}>
              Add vendor
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          data={rows}
          columns={columns}
          loading={vendors.isLoading}
          error={vendors.error}
          onRetry={() => void vendors.refetch()}
          searchPlaceholder="Search vendors…"
          toolbar={<StatusFilter value={status} onChange={setStatus} />}
          getRowId={(vendor) => vendor._id}
          rowClassName={(vendor) => (vendor.isActive ? undefined : 'opacity-60')}
          emptyTitle={status === 'inactive' ? 'No inactive vendors' : 'No vendors yet'}
          emptyDescription="Add the companies you buy products from, such as Aavin or Milkymist."
          emptyAction={
            canManage && status !== 'inactive' ? (
              <Button icon={<Building2 className="size-4" />} onClick={() => openEditor(null)}>
                Add your first vendor
              </Button>
            ) : undefined
          }
        />
      </Card>
      <VendorFormDrawer open={drawerOpen} vendor={editing} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
