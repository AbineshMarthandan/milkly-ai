import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Vendor } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { PageHeader } from '@/components/common/Layout';
import { AddTile, CardGrid, GridSkeleton, ItemCard } from '@/components/explorer/Explorer';
import { usePermission } from '@/hooks/useSession';
import { formatDate } from '@/utils/format';
import { applyFilters, useCatalog, vendorText } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter, useEntityActions } from '../shared/MasterComponents';
import { useSetActive, type StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { VendorFormDrawer } from './VendorFormDrawer';

/** Vendors as cards, in priority (bill) order. */
export default function VendorsPage() {
  const canManage = usePermission('vendor:manage');
  const catalog = useCatalog();
  const setActive = useSetActive('vendors');
  const entityActions = useEntityActions();
  const drawer = useDrawer<Vendor>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');

  const vendors = applyFilters(catalog.vendors, status, search, vendorText);
  const showAddTile = canManage && status !== 'inactive' && !search;

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Companies you buy from. Priority sets the vendor order on every bill."
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
      ) : vendors.length === 0 && !showAddTile ? (
        <EmptyState icon={<Building2 className="size-6" />} title={search ? 'No vendors match your search' : 'No vendors here'} />
      ) : (
        <CardGrid>
          {vendors.map((vendor) => (
            <ItemCard
              key={vendor._id}
              name={vendor.vendorName}
              title={
                <span className="flex items-center gap-2.5">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${catalog.accentOf(vendor._id).tile}`}>
                    <Building2 className={`size-5 ${catalog.accentOf(vendor._id).icon}`} aria-hidden />
                  </span>
                  <span className="truncate">{vendor.vendorName}</span>
                </span>
              }
              badge={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Priority #{vendor.priority}</span>}
              inactive={!vendor.isActive}
              onOpen={canManage ? () => drawer.edit(vendor) : undefined}
              actions={entityActions({
                entityLabel: 'vendor',
                name: vendor.vendorName,
                isActive: vendor.isActive,
                canManage,
                onEdit: () => drawer.edit(vendor),
                onSetActive: (active) => setActive.mutateAsync({ entity: vendor, active }),
                deleteNote: <p className="text-xs text-slate-500">Its categories and products will no longer appear on new bills.</p>,
              })}
              footer={
                <>
                  <span className="font-mono">{vendor._id}</span>
                  <span>Updated {formatDate(vendor.updatedAt.slice(0, 10))}</span>
                </>
              }
            />
          ))}
          {showAddTile && <AddTile label="New vendor" onClick={drawer.create} className="min-h-0 flex-row py-5" />}
        </CardGrid>
      )}

      <VendorFormDrawer open={drawer.open} vendor={drawer.item} onClose={drawer.close} />
    </>
  );
}
