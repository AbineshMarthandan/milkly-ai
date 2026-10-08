import { Plus, Tags } from 'lucide-react';
import { useState } from 'react';
import type { Category } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { CardGrid, FolderTile, GridSkeleton } from '@/components/explorer/Explorer';
import { usePermission } from '@/hooks/useSession';
import { applyFilters, plural, useCatalog } from '../shared/catalog';
import { DeleteImpact, ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { filterByStatus, useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { CategoryCard } from './CategoryCard';
import { CategoryFormDrawer } from './CategoryFormDrawer';

/**
 * Categories, foldered by vendor: each vendor is a folder that opens to its
 * category cards. Typing in search lists matching categories across vendors.
 */
export default function CategoriesPage() {
  const canManage = usePermission('category:manage');
  const catalog = useCatalog();
  const setActive = useSetActive('categories');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Category>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');

  const searching = search.trim().length > 0;
  const results = searching
    ? catalog.vendors.flatMap((vendor) =>
        applyFilters(catalog.categoriesOf(vendor._id), status, search, (category) => category.categoryName).map((category) => ({ vendor, category })),
      )
    : [];
  // Deleted vendors stay visible (dashed) so their categories remain findable.
  const folders = catalog.vendors
    .map((vendor) => ({ vendor, count: filterByStatus(catalog.categoriesOf(vendor._id), status).length }))
    .filter(({ vendor, count }) => (status === 'inactive' ? count > 0 : vendor.isActive || count > 0));

  return (
    <>
      <PageHeader
        title="Categories"
        description="Open a vendor to see its categories. Priority sets the category order inside the vendor on bills."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
              Add category
            </Button>
          )
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder="Search all categories…">
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {catalog.isLoading ? (
        <GridSkeleton />
      ) : catalog.error ? (
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : searching ? (
        results.length === 0 ? (
          <EmptyState icon={<Tags className="size-6" />} title="No categories match your search" />
        ) : (
          <CardGrid>
            {results.map(({ vendor, category }) => (
              <CategoryCard
                key={category._id}
                category={category}
                context={vendor.vendorName}
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
                  deleteNote: <DeleteImpact products={catalog.productsOf(category._id).filter((p) => p.isActive).length} parent="category" />,
                })}
              />
            ))}
          </CardGrid>
        )
      ) : folders.length === 0 ? (
        <EmptyState
          icon={<Tags className="size-6" />}
          title={status === 'inactive' ? 'No inactive categories' : 'No vendors yet'}
          description={status === 'inactive' ? undefined : 'Add a vendor first; its categories live in its folder.'}
        />
      ) : (
        <CardGrid>
          {folders.map(({ vendor, count }) => (
            <FolderTile
              key={vendor._id}
              name={vendor.vendorName}
              to={`/masters/categories/${vendor._id}`}
              accent={catalog.accentOf(vendor._id)}
              meta={plural(count, status === 'inactive' ? 'inactive category' : 'category', status === 'inactive' ? 'inactive categories' : 'categories')}
              inactive={!vendor.isActive}
            />
          ))}
        </CardGrid>
      )}

      <CategoryFormDrawer open={drawer.open} category={drawer.item} onClose={drawer.close} />
    </>
  );
}
