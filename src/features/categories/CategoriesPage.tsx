import { Plus, Tags } from 'lucide-react';
import { useState } from 'react';
import type { Category } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { CardGrid, FolderTile, GridSkeleton, SectionHeading } from '@/components/explorer/Explorer';
import { Combobox } from '@/components/forms/Combobox';
import { usePermission } from '@/hooks/useSession';
import { applyFilters, plural, useCatalog } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { CategoryFormDrawer } from './CategoryFormDrawer';

/** Every category as a folder, grouped under its vendor in priority order. */
export default function CategoriesPage() {
  const canManage = usePermission('category:manage');
  const catalog = useCatalog();
  const setActive = useSetActive('categories');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Category>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');
  const [vendorId, setVendorId] = useState<string | null>(null);

  const groups = catalog.vendors
    .filter((vendor) => !vendorId || vendor._id === vendorId)
    .map((vendor) => ({ vendor, categories: applyFilters(catalog.categoriesOf(vendor._id), status, search, (c) => c.categoryName) }))
    .filter((group) => group.categories.length > 0);

  return (
    <>
      <PageHeader
        title="Categories"
        description="Category folders, grouped by vendor. Open one to see its products. Priority sets the category order inside the vendor on bills."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
              Add category
            </Button>
          )
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder="Search categories…">
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
        <GridSkeleton dense />
      ) : catalog.error ? (
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<Tags className="size-6" />} title={search ? 'No categories match your search' : 'No categories here'} />
      ) : (
        groups.map(({ vendor, categories }) => (
          <section key={vendor._id} className="mb-8">
            <SectionHeading title={vendor.vendorName} count={categories.length} to={`/masters/vendors/${vendor._id}`} />
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
                    canManage,
                    onEdit: () => drawer.edit(category),
                    onSetActive: (active) => setActive.mutateAsync({ entity: category, active }),
                  })}
                />
              ))}
            </CardGrid>
          </section>
        ))
      )}

      <CategoryFormDrawer open={drawer.open} category={drawer.item} defaultVendorId={vendorId} onClose={drawer.close} />
    </>
  );
}
