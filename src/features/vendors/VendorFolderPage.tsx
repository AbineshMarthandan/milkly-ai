import { FolderOpen, Package, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Category, Product } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { AddTile, Breadcrumbs, CardGrid, FolderTile, GridSkeleton, SectionHeading } from '@/components/explorer/Explorer';
import { useCan } from '@/hooks/useSession';
import { CategoryFormDrawer } from '../categories/CategoryFormDrawer';
import { ProductCard } from '../products/ProductCard';
import { ProductFormDrawer } from '../products/ProductFormDrawer';
import { applyFilters, plural, productText, useCatalog } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { VendorFormDrawer } from './VendorFormDrawer';

/** Inside a vendor folder: its category sub-folders, then its products as cards grouped by category. */
export default function VendorFolderPage() {
  const { vendorId = '' } = useParams();
  const can = useCan();
  const catalog = useCatalog();
  const entityActions = useEntityActions();
  const setCategoryActive = useSetActive('categories');
  const setProductActive = useSetActive('products');
  const vendorDrawer = useDrawer<null>();
  const categoryDrawer = useDrawer<Category>();
  const productDrawer = useDrawer<Product>();
  const [productDefaults, setProductDefaults] = useState<string | null>(null);
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
        description="It may have been removed or the link is wrong."
        action={
          <Link to="/masters/vendors">
            <Button variant="secondary">Back to vendors</Button>
          </Link>
        }
      />
    );
  }

  const canManageCategories = can('category:manage');
  const canManageProducts = can('product:manage');
  const allCategories = catalog.categoriesOf(vendor._id);
  const categories = applyFilters(allCategories, status, search, (category) => category.categoryName);
  const activeProducts = catalog.productsOfVendor(vendor._id).filter((product) => product.isActive);
  const groups = allCategories
    .map((category) => ({ category, products: applyFilters(catalog.productsOf(category._id), status, search, productText) }))
    .filter((group) => group.products.length > 0);
  const addProduct = (categoryId: string | null) => {
    setProductDefaults(categoryId);
    productDrawer.create();
  };

  return (
    <>
      <Breadcrumbs items={[{ label: 'Vendors', to: '/masters/vendors' }, { label: vendor.vendorName }]} />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <FolderOpen className={`size-7 ${catalog.accentOf(vendor._id).icon}`} aria-hidden />
            {vendor.vendorName}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Priority #{vendor.priority}</span>
            {!vendor.isActive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Inactive</span>}
          </span>
        }
        description={`${vendor._id} · ${plural(allCategories.filter((c) => c.isActive).length, 'category', 'categories')} · ${plural(activeProducts.length, 'product')}`}
        actions={
          <>
            {can('vendor:manage') && (
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => vendorDrawer.create()}>
                Edit vendor
              </Button>
            )}
            {canManageProducts && vendor.isActive && (
              <Button icon={<Plus className="size-4" />} onClick={() => addProduct(null)}>
                Add product
              </Button>
            )}
          </>
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder={`Search ${vendor.vendorName}…`}>
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      <section className="mb-8">
        <SectionHeading title="Categories" count={categories.length} />
        <CardGrid dense>
          {categories.map((category) => (
            <FolderTile
              key={category._id}
              name={category.categoryName}
              to={`/masters/vendors/${vendor._id}/${category._id}`}
              accent={catalog.accentOf(vendor._id)}
              badge={`#${category.priority}`}
              meta={plural(catalog.productsOf(category._id).filter((p) => p.isActive).length, 'product')}
              inactive={!category.isActive}
              actions={entityActions({
                entityLabel: 'category',
                name: category.categoryName,
                isActive: category.isActive,
                canManage: canManageCategories,
                onEdit: () => categoryDrawer.edit(category),
                onSetActive: (active) => setCategoryActive.mutateAsync({ entity: category, active }),
              })}
            />
          ))}
          {canManageCategories && vendor.isActive && status !== 'inactive' && !search && (
            <AddTile folder label="New category" onClick={categoryDrawer.create} />
          )}
        </CardGrid>
        {!categories.length && !(canManageCategories && vendor.isActive) && <p className="text-sm text-slate-500">No categories.</p>}
      </section>

      <section>
        {groups.length === 0 ? (
          <EmptyState
            icon={<Package className="size-6" />}
            title={search ? 'No products match your search' : 'No products in this vendor yet'}
            action={
              canManageProducts && vendor.isActive && !search ? (
                <Button icon={<Plus className="size-4" />} onClick={() => addProduct(null)}>
                  Add product
                </Button>
              ) : undefined
            }
          />
        ) : (
          groups.map(({ category, products }) => (
            <div key={category._id} className="mb-8">
              <SectionHeading
                title={category.categoryName}
                count={products.length}
                to={`/masters/vendors/${vendor._id}/${category._id}`}
                actions={
                  canManageProducts &&
                  category.isActive && (
                    <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => addProduct(category._id)}>
                      Add to {category.categoryName}
                    </Button>
                  )
                }
              />
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
              </CardGrid>
            </div>
          ))
        )}
      </section>

      <VendorFormDrawer open={vendorDrawer.open} vendor={vendor} onClose={vendorDrawer.close} />
      <CategoryFormDrawer open={categoryDrawer.open} category={categoryDrawer.item} defaultVendorId={vendor._id} onClose={categoryDrawer.close} />
      <ProductFormDrawer
        open={productDrawer.open}
        product={productDrawer.item}
        defaultVendorId={vendor._id}
        defaultCategoryId={productDefaults}
        onClose={productDrawer.close}
      />
    </>
  );
}
