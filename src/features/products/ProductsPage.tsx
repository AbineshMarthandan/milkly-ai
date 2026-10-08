import { Package, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { CardGrid, FolderTile, GridSkeleton } from '@/components/explorer/Explorer';
import { usePermission } from '@/hooks/useSession';
import { applyFilters, plural, productText, useCatalog } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { filterByStatus, useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { ProductCard } from './ProductCard';
import { ProductFormDrawer } from './ProductFormDrawer';

/**
 * Products, foldered by vendor: each vendor is a folder that opens to its
 * product cards. Typing in search lists matching products across vendors.
 */
export default function ProductsPage() {
  const canManage = usePermission('product:manage');
  const catalog = useCatalog();
  const setActive = useSetActive('products');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Product>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');

  const searching = search.trim().length > 0;
  const results = searching
    ? catalog.vendors.flatMap((vendor) =>
        applyFilters(catalog.productsOfVendor(vendor._id), status, search, productText).map((product) => ({ vendor, product })),
      )
    : [];
  // Deleted vendors stay visible (dashed) so their products remain findable.
  const folders = catalog.vendors
    .map((vendor) => ({ vendor, count: filterByStatus(catalog.productsOfVendor(vendor._id), status).length }))
    .filter(({ vendor, count }) => (status === 'inactive' ? count > 0 : vendor.isActive || count > 0));

  return (
    <>
      <PageHeader
        title="Products"
        description="Open a vendor to see its products. Changing a price never alters saved bills."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
              Add product
            </Button>
          )
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder="Search all products…">
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {catalog.isLoading ? (
        <GridSkeleton />
      ) : catalog.error ? (
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : searching ? (
        results.length === 0 ? (
          <EmptyState icon={<Package className="size-6" />} title="No products match your search" />
        ) : (
          <CardGrid>
            {results.map(({ vendor, product }) => (
              <ProductCard
                key={product._id}
                product={product}
                billingBlocker={catalog.billingBlockerOf(product)}
                context={`${vendor.vendorName} › ${catalog.categoryById.get(product.categoryId)?.categoryName ?? ''}`}
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
        )
      ) : folders.length === 0 ? (
        <EmptyState icon={<Package className="size-6" />} title={status === 'inactive' ? 'No inactive products' : 'No vendors yet'} />
      ) : (
        <CardGrid>
          {folders.map(({ vendor, count }) => (
            <FolderTile
              key={vendor._id}
              name={vendor.vendorName}
              to={`/masters/products/${vendor._id}`}
              accent={catalog.accentOf(vendor._id)}
              meta={plural(count, status === 'inactive' ? 'inactive product' : 'product')}
              inactive={!vendor.isActive}
            />
          ))}
        </CardGrid>
      )}

      <ProductFormDrawer open={drawer.open} product={drawer.item} onClose={drawer.close} />
    </>
  );
}
