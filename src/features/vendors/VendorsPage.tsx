import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Vendor } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { AddTile, CardGrid, FolderTile, GridSkeleton } from '@/components/explorer/Explorer';
import { usePermission } from '@/hooks/useSession';
import { applyFilters, plural, useCatalog, vendorText } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { VendorFormDrawer } from './VendorFormDrawer';

/** Vendors as folders, in priority order. Opening one shows its categories and products. */
export default function VendorsPage() {
  const canManage = usePermission('vendor:manage');
  const catalog = useCatalog();
  const setActive = useSetActive('vendors');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Vendor>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');

  const vendors = applyFilters(catalog.vendors, status, search, vendorText);

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Each vendor is a folder. Open one to see its categories and products. Priority sets the vendor order on every bill."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={drawer.create}>
              Add vendor
            </Button>
          )
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder="Search vendors…">
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {catalog.isLoading ? (
        <GridSkeleton />
      ) : catalog.error ? (
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : vendors.length === 0 && !(canManage && status !== 'inactive' && !search) ? (
        <EmptyState icon={<Building2 className="size-6" />} title={search ? 'No vendors match your search' : 'No vendors here'} />
      ) : (
        <CardGrid>
          {vendors.map((vendor) => {
            const categories = catalog.categoriesOf(vendor._id).filter((category) => category.isActive);
            const products = catalog.productsOfVendor(vendor._id).filter((product) => product.isActive);
            return (
              <FolderTile
                key={vendor._id}
                name={vendor.vendorName}
                to={`/masters/vendors/${vendor._id}`}
                accent={catalog.accentOf(vendor._id)}
                badge={`#${vendor.priority}`}
                meta={`${plural(categories.length, 'category', 'categories')} · ${plural(products.length, 'product')}`}
                inactive={!vendor.isActive}
                actions={entityActions({
                  entityLabel: 'vendor',
                  name: vendor.vendorName,
                  isActive: vendor.isActive,
                  canManage,
                  onEdit: () => drawer.edit(vendor),
                  onSetActive: (active) => setActive.mutateAsync({ entity: vendor, active }),
                  deleteNote: <p className="text-xs text-slate-500">Its categories and products will no longer appear on new bills.</p>,
                })}
              >
                <div className="flex flex-wrap gap-1">
                  {categories.slice(0, 4).map((category) => (
                    <span key={category._id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {category.categoryName}
                    </span>
                  ))}
                  {categories.length > 4 && <span className="px-1 text-[11px] text-slate-400">+{categories.length - 4} more</span>}
                </div>
              </FolderTile>
            );
          })}
          {canManage && status !== 'inactive' && !search && <AddTile folder label="New vendor" onClick={drawer.create} />}
        </CardGrid>
      )}

      <VendorFormDrawer open={drawer.open} vendor={drawer.item} onClose={drawer.close} />
    </>
  );
}
