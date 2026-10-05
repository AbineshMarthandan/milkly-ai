import { createColumnHelper } from '@tanstack/react-table';
import { Package, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { EntityId, Product } from '@/domain/models';
import { calculateDiscountPercentage } from '@/domain/services/billing/calculations';
import { roundMoney } from '@/domain/services/money';
import { sortByPriority } from '@/domain/services/ordering';
import { Button } from '@/components/common/Button';
import { Card, PageHeader, StatusBadge } from '@/components/common/Layout';
import { Combobox, type ComboOption } from '@/components/forms/Combobox';
import { DataTable } from '@/components/tables/DataTable';
import { useMoney } from '@/hooks/useAppSettings';
import { usePermission } from '@/hooks/useSession';
import { formatPercent } from '@/utils/format';
import { IdCell, RowActions, StatusFilter } from '../shared/MasterComponents';
import { filterByStatus, useMasterList, useSetActive, type StatusFilterValue } from '../shared/masterData';
import { ProductFormDrawer } from './ProductFormDrawer';

const column = createColumnHelper<
  Product & { vendorName: string; categoryName: string; discountPercentage: number; margin: number }
>();

export default function ProductsPage() {
  const canManage = usePermission('product:manage');
  const money = useMoney();
  const products = useMasterList('products');
  const { data: vendors = [] } = useMasterList('vendors');
  const { data: categories = [] } = useMasterList('categories');
  const setActive = useSetActive('products');
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [vendorId, setVendorId] = useState<EntityId | null>(null);
  const [categoryId, setCategoryId] = useState<EntityId | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openEditor = (product: Product | null) => {
    setEditing(product);
    setDrawerOpen(true);
  };

  const changeVendorFilter = (value: EntityId | null) => {
    setVendorId(value);
    setCategoryId(null);
  };

  /** `id → position` in priority order, so lists can sort vendor → category → product. */
  const ranks = useMemo(() => {
    const vendorRank = new Map(sortByPriority(vendors, (vendor) => vendor.vendorName).map((vendor, index) => [vendor._id, index]));
    const categoryRank = new Map(
      sortByPriority(categories, (category) => category.categoryName).map((category, index) => [category._id, index]),
    );
    return {
      vendor: (id: EntityId) => vendorRank.get(id) ?? Number.MAX_SAFE_INTEGER,
      category: (id: EntityId) => categoryRank.get(id) ?? Number.MAX_SAFE_INTEGER,
    };
  }, [vendors, categories]);

  // Every vendor/category (inactive ones too), so inactive products can still be found.
  const vendorOptions = useMemo<ComboOption[]>(
    () =>
      sortByPriority(vendors, (vendor) => vendor.vendorName).map((vendor) => ({
        value: vendor._id,
        label: vendor.vendorName,
        meta: vendor.isActive ? undefined : 'Inactive',
      })),
    [vendors],
  );
  const categoryOptions = useMemo<ComboOption[]>(() => {
    const vendorById = new Map(vendors.map((vendor) => [vendor._id, vendor]));
    return sortByPriority(
      categories.filter((category) => !vendorId || category.vendorId === vendorId),
      (category) => category.categoryName,
    )
      .sort((a, b) => ranks.vendor(a.vendorId) - ranks.vendor(b.vendorId))
      .map((category) => ({
        value: category._id,
        label: category.categoryName,
        description: vendorId ? undefined : vendorById.get(category.vendorId)?.vendorName,
        meta: category.isActive ? undefined : 'Inactive',
      }));
  }, [vendors, categories, vendorId, ranks]);

  // Bill order: vendor priority → category priority → product priority.
  const rows = useMemo(() => {
    const vendorById = new Map(vendors.map((vendor) => [vendor._id, vendor]));
    const categoryById = new Map(categories.map((category) => [category._id, category]));
    const visible = filterByStatus(products.data ?? [], status).filter(
      (product) => (!vendorId || product.vendorId === vendorId) && (!categoryId || product.categoryId === categoryId),
    );
    return sortByPriority(visible, (product) => `${product.productName} ${product.unit}`)
      .sort((a, b) => ranks.vendor(a.vendorId) - ranks.vendor(b.vendorId) || ranks.category(a.categoryId) - ranks.category(b.categoryId))
      .map((product) => ({
        ...product,
        vendorName: vendorById.get(product.vendorId)?.vendorName ?? product.vendorId,
        categoryName: categoryById.get(product.categoryId)?.categoryName ?? product.categoryId,
        discountPercentage: calculateDiscountPercentage(product.mrp, product.sellingPrice),
        margin: roundMoney(product.sellingPrice - product.purchasePrice),
      }));
  }, [products.data, vendors, categories, ranks, status, vendorId, categoryId]);

  const columns = useMemo(
    () => [
      column.accessor((product) => `${product.productName} ${product.unit} ${product._id}`, {
        id: 'product',
        header: 'Product',
        cell: ({ row }) => (
          <div className="min-w-40">
            <span className="font-medium text-slate-900">{row.original.productName}</span>{' '}
            <span className="text-slate-500">{row.original.unit}</span>
            <div>
              <IdCell id={row.original._id} />
            </div>
          </div>
        ),
      }),
      column.accessor('vendorName', { header: 'Vendor', meta: { hideOnMobile: true } }),
      column.accessor('categoryName', { header: 'Category' }),
      column.accessor('purchasePrice', {
        header: 'Purchase',
        cell: (info) => money(info.getValue()),
        meta: { align: 'right', hideOnMobile: true },
      }),
      column.accessor('mrp', { header: 'MRP', cell: (info) => money(info.getValue()), meta: { align: 'right' } }),
      column.accessor('sellingPrice', {
        header: 'Selling',
        cell: (info) => <span className="font-medium text-slate-900">{money(info.getValue())}</span>,
        meta: { align: 'right' },
      }),
      column.accessor('discountPercentage', {
        header: 'Disc %',
        cell: (info) => formatPercent(info.getValue()),
        meta: { align: 'right', hideOnMobile: true },
      }),
      column.accessor('margin', {
        header: 'Margin',
        cell: (info) => (
          <span className={info.getValue() < 0 ? 'font-medium text-rose-600' : 'text-slate-500'}>{money(info.getValue())}</span>
        ),
        meta: { align: 'right', hideOnMobile: true },
      }),
      column.accessor('isActive', { header: 'Status', cell: (info) => <StatusBadge active={info.getValue()} /> }),
      column.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            entityLabel="product"
            name={`${row.original.productName} (${row.original.unit})`}
            isActive={row.original.isActive}
            canManage={canManage}
            onEdit={() => openEditor(row.original)}
            onSetActive={(active) => setActive.mutateAsync({ entity: row.original, active })}
            deleteNote={<p className="text-xs text-slate-500">It will no longer appear on new bills.</p>}
          />
        ),
      }),
    ],
    [canManage, setActive, money],
  );

  return (
    <>
      <PageHeader
        title="Products"
        description="Items you sell, with purchase, MRP and selling prices. Priority sets their order inside the category on every bill."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={() => openEditor(null)}>
              Add product
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          data={rows}
          columns={columns}
          loading={products.isLoading}
          error={products.error}
          onRetry={() => void products.refetch()}
          searchPlaceholder="Search products…"
          toolbar={
            <>
              <label htmlFor="product-vendor-filter" className="sr-only">
                Filter by vendor
              </label>
              <Combobox
                id="product-vendor-filter"
                options={vendorOptions}
                value={vendorId}
                onChange={changeVendorFilter}
                clearable
                placeholder="All vendors"
                className="sm:w-52"
              />
              <label htmlFor="product-category-filter" className="sr-only">
                Filter by category
              </label>
              <Combobox
                id="product-category-filter"
                options={categoryOptions}
                value={categoryId}
                onChange={setCategoryId}
                clearable
                placeholder="All categories"
                emptyText="No categories"
                className="sm:w-52"
              />
              <StatusFilter value={status} onChange={setStatus} />
            </>
          }
          getRowId={(product) => product._id}
          rowClassName={(product) => (product.isActive ? undefined : 'opacity-60')}
          emptyTitle={
            status === 'inactive' ? 'No inactive products' : vendorId || categoryId ? 'No products match these filters' : 'No products yet'
          }
          emptyDescription="Add the items you sell, such as Toned Milk 500 ml, with their MRP and selling price."
          emptyAction={
            canManage && status !== 'inactive' ? (
              <Button icon={<Package className="size-4" />} onClick={() => openEditor(null)}>
                Add a product
              </Button>
            ) : undefined
          }
        />
      </Card>
      <ProductFormDrawer
        open={drawerOpen}
        product={editing}
        defaultVendorId={vendorId}
        defaultCategoryId={categoryId}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
