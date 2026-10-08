import { FolderOpen, Package, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import type { Product } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { AddTile, Breadcrumbs, CardGrid, GridSkeleton } from '@/components/explorer/Explorer';
import { useCan } from '@/hooks/useSession';
import { CategoryFormDrawer } from '../categories/CategoryFormDrawer';
import { ProductCard } from '../products/ProductCard';
import { ProductFormDrawer } from '../products/ProductFormDrawer';
import { applyFilters, plural, productText, useCatalog } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';

/** Inside a category folder: its products as cards, in priority (bill) order. */
export default function CategoryFolderPage() {
  const { vendorId = '', categoryId = '' } = useParams();
  const can = useCan();
  const catalog = useCatalog();
  const entityActions = useEntityActions();
  const setProductActive = useSetActive('products');
  const categoryDrawer = useDrawer<null>();
  const productDrawer = useDrawer<Product>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');

  const category = catalog.categoryById.get(categoryId);
  const vendor = category ? catalog.vendorById.get(category.vendorId) : undefined;
  if (catalog.isLoading) return <GridSkeleton />;
  if (catalog.error) return <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!category || !vendor) {
    return (
      <EmptyState
        className="py-24"
        title="Category not found"
        description="It may have been removed or the link is wrong."
        action={
          <Link to="/masters/vendors">
            <Button variant="secondary">Back to vendors</Button>
          </Link>
        }
      />
    );
  }
  // Old or hand-typed links: send to the category's real vendor folder.
  if (vendor._id !== vendorId) return <Navigate to={`/masters/vendors/${vendor._id}/${category._id}`} replace />;

  const canManageProducts = can('product:manage');
  const allProducts = catalog.productsOf(category._id);
  const products = applyFilters(allProducts, status, search, productText);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Vendors', to: '/masters/vendors' },
          { label: vendor.vendorName, to: `/masters/vendors/${vendor._id}` },
          { label: category.categoryName },
        ]}
      />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <FolderOpen className={`size-7 ${catalog.accentOf(vendor._id).icon}`} aria-hidden />
            {category.categoryName}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Priority #{category.priority}</span>
            {!category.isActive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Inactive</span>}
          </span>
        }
        description={`${vendor.vendorName} · ${category._id} · ${plural(allProducts.filter((p) => p.isActive).length, 'product')}`}
        actions={
          <>
            {can('category:manage') && (
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => categoryDrawer.create()}>
                Edit category
              </Button>
            )}
            {canManageProducts && category.isActive && vendor.isActive && (
              <Button icon={<Plus className="size-4" />} onClick={productDrawer.create}>
                Add product
              </Button>
            )}
          </>
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder={`Search ${category.categoryName}…`}>
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {products.length === 0 && !(canManageProducts && category.isActive && !search) ? (
        <EmptyState icon={<Package className="size-6" />} title={search ? 'No products match your search' : 'No products here'} />
      ) : (
        <CardGrid>
          {products.map((product) => (
            <ProductCard
              key={product._id}
              product={product}
              onOpen={canManageProducts ? () => productDrawer.edit(product) : undefined}
              actions={entityActions({
                entityLabel: 'product',
                name: `${product.productName} (${product.unit})`,
                isActive: product.isActive,
                canManage: canManageProducts,
                onEdit: () => productDrawer.edit(product),
                onSetActive: (active) => setProductActive.mutateAsync({ entity: product, active }),
              })}
            />
          ))}
          {canManageProducts && category.isActive && vendor.isActive && status !== 'inactive' && !search && (
            <AddTile label="New product" onClick={productDrawer.create} />
          )}
        </CardGrid>
      )}

      <CategoryFormDrawer open={categoryDrawer.open} category={category} defaultVendorId={vendor._id} onClose={categoryDrawer.close} />
      <ProductFormDrawer
        open={productDrawer.open}
        product={productDrawer.item}
        defaultVendorId={vendor._id}
        defaultCategoryId={category._id}
        onClose={productDrawer.close}
      />
    </>
  );
}
