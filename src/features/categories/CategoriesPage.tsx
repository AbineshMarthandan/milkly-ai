import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Category, EntityId } from '@/domain/models';
import { sortByPriority } from '@/domain/services/ordering';
import { Button } from '@/components/common/Button';
import { Card, PageHeader, StatusBadge } from '@/components/common/Layout';
import { Combobox, type ComboOption } from '@/components/forms/Combobox';
import { DataTable } from '@/components/tables/DataTable';
import { usePermission } from '@/hooks/useSession';
import { IdCell, RowActions, StatusFilter } from '../shared/MasterComponents';
import { filterByStatus, useMasterList, useSetActive, type StatusFilterValue } from '../shared/masterData';
import { CategoryFormDrawer } from './CategoryFormDrawer';

const column = createColumnHelper<Category & { vendorName: string; productCount: number }>();

export default function CategoriesPage() {
  const canManage = usePermission('category:manage');
  const categories = useMasterList('categories');
  const { data: vendors = [] } = useMasterList('vendors');
  const { data: products = [] } = useMasterList('products');
  const setActive = useSetActive('categories');
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [vendorId, setVendorId] = useState<EntityId | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openEditor = (category: Category | null) => {
    setEditing(category);
    setDrawerOpen(true);
  };

  // Every vendor (inactive ones too), so inactive categories can still be found.
  const vendorOptions = useMemo<ComboOption[]>(
    () =>
      sortByPriority(vendors, (vendor) => vendor.vendorName).map((vendor) => ({
        value: vendor._id,
        label: vendor.vendorName,
        meta: vendor.isActive ? undefined : 'Inactive',
      })),
    [vendors],
  );

  // Bill order: vendor priority first, then category priority inside the vendor.
  const rows = useMemo(() => {
    const vendorById = new Map(vendors.map((vendor) => [vendor._id, vendor]));
    const vendorRank = new Map(sortByPriority(vendors, (vendor) => vendor.vendorName).map((vendor, index) => [vendor._id, index]));
    const rankOf = (id: EntityId) => vendorRank.get(id) ?? Number.MAX_SAFE_INTEGER;
    const visible = filterByStatus(categories.data ?? [], status).filter((category) => !vendorId || category.vendorId === vendorId);
    return sortByPriority(visible, (category) => category.categoryName)
      .sort((a, b) => rankOf(a.vendorId) - rankOf(b.vendorId))
      .map((category) => ({
        ...category,
        vendorName: vendorById.get(category.vendorId)?.vendorName ?? category.vendorId,
        productCount: products.filter((product) => product.categoryId === category._id && product.isActive).length,
      }));
  }, [categories.data, vendors, products, status, vendorId]);

  const columns = useMemo(
    () => [
      column.accessor('priority', { header: 'Priority', meta: { className: 'w-20' } }),
      column.accessor('categoryName', {
        header: 'Category',
        cell: (info) => <span className="font-medium text-slate-900">{info.getValue()}</span>,
      }),
      column.accessor('vendorName', { header: 'Vendor' }),
      column.accessor('_id', { header: 'Category ID', cell: (info) => <IdCell id={info.getValue()} />, meta: { hideOnMobile: true } }),
      column.accessor('productCount', { header: 'Products', meta: { align: 'right', hideOnMobile: true } }),
      column.accessor('isActive', { header: 'Status', cell: (info) => <StatusBadge active={info.getValue()} /> }),
      column.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            entityLabel="category"
            name={row.original.categoryName}
            isActive={row.original.isActive}
            canManage={canManage}
            onEdit={() => openEditor(row.original)}
            onSetActive={(active) => setActive.mutateAsync({ entity: row.original, active })}
            deleteNote={<p className="text-xs text-slate-500">Its products will no longer appear on new bills.</p>}
          />
        ),
      }),
    ],
    [canManage, setActive],
  );

  return (
    <>
      <PageHeader
        title="Categories"
        description="Product groups within each vendor. Priority sets their order inside the vendor on every bill."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={() => openEditor(null)}>
              Add category
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          data={rows}
          columns={columns}
          loading={categories.isLoading}
          error={categories.error}
          onRetry={() => void categories.refetch()}
          searchPlaceholder="Search categories…"
          toolbar={
            <>
              <label htmlFor="category-vendor-filter" className="sr-only">
                Filter by vendor
              </label>
              <Combobox
                id="category-vendor-filter"
                options={vendorOptions}
                value={vendorId}
                onChange={setVendorId}
                clearable
                placeholder="All vendors"
                className="sm:w-56"
              />
              <StatusFilter value={status} onChange={setStatus} />
            </>
          }
          getRowId={(category) => category._id}
          rowClassName={(category) => (category.isActive ? undefined : 'opacity-60')}
          emptyTitle={status === 'inactive' ? 'No inactive categories' : vendorId ? 'No categories for this vendor' : 'No categories yet'}
          emptyDescription="Group each vendor's products, such as Milk, Curd or Ghee."
          emptyAction={
            canManage && status !== 'inactive' ? (
              <Button icon={<Tags className="size-4" />} onClick={() => openEditor(null)}>
                Add a category
              </Button>
            ) : undefined
          }
        />
      </Card>
      <CategoryFormDrawer open={drawerOpen} category={editing} defaultVendorId={vendorId} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
