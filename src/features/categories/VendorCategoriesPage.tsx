import { FolderOpen, Plus, Tags } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Category } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { AddTile, Breadcrumbs, CardGrid, GridSkeleton } from '@/components/explorer/Explorer';
import { usePermission } from '@/hooks/useSession';
import { applyFilters, plural, useCatalog } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { CategoryCard } from './CategoryCard';
import { CategoryFormDrawer } from './CategoryFormDrawer';

/** One vendor's folder in Categories: its category cards in priority order. */
export default function VendorCategoriesPage() {
  const { vendorId = '' } = useParams();
  const canManage = usePermission('category:manage');
  const catalog = useCatalog();
  const setActive = useSetActive('categories');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Category>();
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
          <Link to="/masters/categories">
            <Button variant="secondary">Back to categories</Button>
          </Link>
        }
      />
    );
  }

  const all = catalog.categoriesOf(vendor._id);
  const categories = applyFilters(all, status, search, (category) => category.categoryName);
  const showAddTile = canManage && vendor.isActive && status !== 'inactive' && !search;

  return (
    <>
      <Breadcrumbs items={[{ label: 'Categories', to: '/masters/categories' }, { label: vendor.vendorName }]} />
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <FolderOpen className={`size-7 ${catalog.accentOf(vendor._id).icon}`} aria-hidden />
            {vendor.vendorName}
          </span>
        }
        description={`${plural(all.filter((c) => c.isActive).length, 'category', 'categories')}${vendor.isActive ? '' : ' · vendor inactive'}`}
        actions={
          canManage &&
          vendor.isActive && (
            <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
              Add category
            </Button>
          )
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder={`Search ${vendor.vendorName} categories…`}>
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {categories.length === 0 && !showAddTile ? (
        <EmptyState icon={<Tags className="size-6" />} title={search ? 'No categories match your search' : 'No categories here'} />
      ) : (
        <CardGrid>
          {categories.map((category) => (
            <CategoryCard
              key={category._id}
              category={category}
              accent={catalog.accentOf(vendor._id)}
              productCount={catalog.productsOf(category._id).filter((product) => product.isActive).length}
              onOpen={canManage ? () => drawer.edit(category) : undefined}
              actions={entityActions({
                entityLabel: 'category',
                name: category.categoryName,
                isActive: category.isActive,
                canManage,
                onEdit: () => drawer.edit(category),
                onSetActive: (active) => setActive.mutateAsync({ entity: category, active }),
              })}
            />
          ))}
          {showAddTile && <AddTile label="New category" onClick={drawer.create} className="min-h-0 flex-row py-5" />}
        </CardGrid>
      )}

      <CategoryFormDrawer open={drawer.open} category={drawer.item} defaultVendorId={vendor._id} onClose={drawer.close} />
    </>
  );
}
