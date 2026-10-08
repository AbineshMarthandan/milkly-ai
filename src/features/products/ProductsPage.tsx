import { Package, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { CardGrid, GridSkeleton, SectionHeading } from '@/components/explorer/Explorer';
import { Combobox } from '@/components/forms/Combobox';
import { usePermission } from '@/hooks/useSession';
import { applyFilters, productText, useCatalog } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { ProductCard } from './ProductCard';
import { ProductFormDrawer } from './ProductFormDrawer';

/** Every product as a card, grouped vendor › category in bill order. */
export default function ProductsPage() {
  const canManage = usePermission('product:manage');
  const catalog = useCatalog();
  const setActive = useSetActive('products');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Product>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');
  const [vendorId, setVendorId] = useState<string | null>(null);

  const groups = catalog.vendors
    .filter((vendor) => !vendorId || vendor._id === vendorId)
    .flatMap((vendor) =>
      catalog.categoriesOf(vendor._id).map((category) => ({
        vendor,
        category,
        products: applyFilters(catalog.productsOf(category._id), status, search, productText),
      })),
    )
    .filter((group) => group.products.length > 0);

  return (
    <>
      <PageHeader
        title="Products"
        description="All products as cards, grouped by vendor and category. Changing a price never alters saved bills."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
              Add product
            </Button>
          )
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder="Search products…">
        <Combobox
          className="sm:w-56"
          options={catalog.vendors.map((vendor) => ({ value: vendor._id, label: vendor.vendorName }))}
          value={vendorId}
          onChange={setVendorId}
          placeholder="All vendors"
          clearable
        />
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {catalog.isLoading ? (
        <GridSkeleton />
      ) : catalog.error ? (
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<Package className="size-6" />} title={search ? 'No products match your search' : 'No products here'} />
      ) : (
        groups.map(({ vendor, category, products }) => (
          <section key={category._id} className="mb-8">
            <SectionHeading
              title={
                <>
                  {vendor.vendorName}
                  <span className="mx-1.5 text-slate-300">›</span>
                  {category.categoryName}
                </>
              }
              count={products.length}
              to={`/masters/vendors/${vendor._id}/${category._id}`}
            />
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
            </CardGrid>
          </section>
        ))
      )}

      <ProductFormDrawer open={drawer.open} product={drawer.item} defaultVendorId={vendorId} onClose={drawer.close} />
    </>
  );
}
