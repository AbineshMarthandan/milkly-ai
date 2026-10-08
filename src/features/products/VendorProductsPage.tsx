import { FolderOpen, Package, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { Product } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { AddTile, Breadcrumbs, CardGrid, GridSkeleton, SectionHeading } from '@/components/explorer/Explorer';
import { usePermission } from '@/hooks/useSession';
import { cn } from '@/utils/cn';
import { applyFilters, plural, productText, useCatalog } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { ProductCard } from './ProductCard';
import { ProductFormDrawer } from './ProductFormDrawer';

/** One vendor's folder in Products: product cards grouped by category, filterable by category chips. */
export default function VendorProductsPage() {
  const { vendorId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const canManage = usePermission('product:manage');
  const catalog = useCatalog();
  const setActive = useSetActive('products');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Product>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');

  const vendor = catalog.vendorById.get(vendorId);
  if (catalog.isLoading) return <GridSkeleton />;
  if (catalog.error) return <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!vendor) {
    return (
      <EmptyState
        className="py-24"
        title="Vendor not found"
        action={
          <Link to="/masters/products">
            <Button variant="secondary">Back to products</Button>
          </Link>
        }
      />
    );
  }

  const categories = catalog.categoriesOf(vendor._id).filter((category) => category.isActive || status !== 'active');
  const selectedId = params.get('category');
  const selected = categories.find((category) => category._id === selectedId) ?? null;
  const selectCategory = (id: string | null) => setParams(id ? { category: id } : {}, { replace: true });

  const groups = (selected ? [selected] : categories)
    .map((category) => ({ category, products: applyFilters(catalog.productsOf(category._id), status, search, productText) }))
    .filter((group) => group.products.length > 0);
  const total = catalog.productsOfVendor(vendor._id).filter((product) => product.isActive).length;
  const canAdd = canManage && vendor.isActive;

  return (
    <>
      <Breadcrumbs items={[{ label: 'Products', to: '/masters/products' }, { label: vendor.vendorName }]} />
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <FolderOpen className={`size-7 ${catalog.accentOf(vendor._id).icon}`} aria-hidden />
            {vendor.vendorName}
          </span>
        }
        description={`${plural(total, 'product')}${vendor.isActive ? '' : ' · vendor inactive'}`}
        actions={
          canAdd && (
            <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
              Add product
            </Button>
          )
        }
      />

      {categories.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="toolbar" aria-label="Filter by category">
          {[{ _id: null, categoryName: 'All' }, ...categories].map((category) => {
            const active = (category._id ?? null) === (selected?._id ?? null);
            const count = category._id
              ? catalog.productsOf(category._id).filter((product) => product.isActive).length
              : total;
            return (
              <button
                key={category._id ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => selectCategory(category._id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  active ? 'border-brand-600 bg-brand-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-800',
                )}
              >
                {category.categoryName} <span className={cn('ml-1 text-xs', active ? 'text-brand-100' : 'text-slate-400')}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <ExplorerToolbar search={search} onSearch={setSearch} placeholder={`Search ${vendor.vendorName} products…`}>
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {groups.length === 0 ? (
        <EmptyState
          icon={<Package className="size-6" />}
          title={search ? 'No products match your search' : 'No products here'}
          action={
            canAdd && !search ? (
              <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
                Add product
              </Button>
            ) : undefined
          }
        />
      ) : (
        groups.map(({ category, products }, index) => (
          <section key={category._id} className="mb-8">
            <SectionHeading title={category.categoryName} count={products.length} />
            <CardGrid>
              {products.map((product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  onOpen={canManage ? () => drawer.edit(product) : undefined}
                  actions={entityActions({
                    entityLabel: 'product',
                    name: `${product.productName} (${product.unit})`,
                    isActive: product.isActive,
                    canManage,
                    onEdit: () => drawer.edit(product),
                    onSetActive: (active) => setActive.mutateAsync({ entity: product, active }),
                  })}
                />
              ))}
              {canAdd && category.isActive && status !== 'inactive' && !search && (selected || index === groups.length - 1) && (
                <AddTile label={selected ? `New ${category.categoryName} product` : 'New product'} onClick={drawer.create} />
              )}
            </CardGrid>
          </section>
        ))
      )}

      <ProductFormDrawer
        open={drawer.open}
        product={drawer.item}
        defaultVendorId={vendor._id}
        defaultCategoryId={selected?._id ?? null}
        onClose={drawer.close}
      />
    </>
  );
}
