import { Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useCallback, type ReactNode } from 'react';
import { toast } from 'sonner';
import { SegmentedControl } from '@/components/common/Layout';
import type { CardAction } from '@/components/explorer/Explorer';
import { Input } from '@/components/forms/Field';
import { useConfirm } from '@/components/modals/ConfirmProvider';
import type { StatusFilterValue } from './masterData';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
] as const;

export function StatusFilter({ value, onChange }: { value: StatusFilterValue; onChange: (value: StatusFilterValue) => void }) {
  return <SegmentedControl ariaLabel="Status filter" value={value} options={STATUS_OPTIONS} onChange={onChange} />;
}

/** Search box + filters row above a folder or card grid. */
export function ExplorerToolbar({
  search,
  onSearch,
  placeholder,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        type="search"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        leading={<Search className="size-4" />}
        className="sm:w-72"
      />
      {children}
    </div>
  );
}

export interface EntityActionOptions {
  /** e.g. "vendor" */
  entityLabel: string;
  name: string;
  isActive: boolean;
  canManage: boolean;
  onEdit: () => void;
  /** Soft delete (`active = false`) or restore (`active = true`). */
  onSetActive: (active: boolean) => Promise<unknown>;
  /** Extra explanation shown in the delete confirmation. */
  deleteNote?: ReactNode;
}

/**
 * Builds the Edit / Delete / Restore menu for a folder or card. "Delete" is
 * always a soft delete: the record is deactivated, hidden from billing, and
 * can be restored. Saved bills keep their own snapshot.
 */
export function useEntityActions(): (options: EntityActionOptions) => CardAction[] {
  const confirm = useConfirm();
  return useCallback(
    ({ entityLabel, name, isActive, canManage, onEdit, onSetActive, deleteNote }: EntityActionOptions) => {
      if (!canManage) return [];
      const remove = async () => {
        const ok = await confirm({
          title: `Delete ${entityLabel}?`,
          tone: 'danger',
          confirmLabel: 'Delete',
          description: (
            <div className="space-y-2">
              <p>
                <b>{name}</b> will be deactivated and hidden from billing. Saved bills are not affected, and you can restore it at any time from the
                “Inactive” filter.
              </p>
              {deleteNote}
            </div>
          ),
        });
        if (!ok) return;
        try {
          await onSetActive(false);
          toast.success(`${name} deleted (deactivated)`);
        } catch {
          /* error toast shown by the mutation cache */
        }
      };
      const restore = async () => {
        try {
          await onSetActive(true);
          toast.success(`${name} restored`);
        } catch {
          /* error toast shown by the mutation cache */
        }
      };
      return [
        { label: 'Edit', icon: Pencil, onSelect: onEdit },
        isActive
          ? { label: 'Delete', icon: Trash2, tone: 'danger', onSelect: () => void remove() }
          : { label: 'Restore', icon: RotateCcw, tone: 'brand', onSelect: () => void restore() },
      ];
    },
    [confirm],
  );
}

/**
 * Spells out what deleting a vendor or category does to the records under it:
 * nothing is deleted or changed; they are only hidden from new bills until the
 * parent is restored.
 */
export function DeleteImpact({ parent, categories, products }: { parent: 'vendor' | 'category'; categories?: number; products: number }) {
  const parts = [
    categories ? `${categories} ${categories === 1 ? 'category' : 'categories'}` : null,
    products ? `${products} ${products === 1 ? 'product' : 'products'}` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  const one = (categories ?? 0) + products === 1;
  return (
    <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
      <b>Nothing under it is deleted.</b> Its {parts.join(' and ')} {one ? 'stays' : 'stay'} saved with {one ? 'its' : 'their'} prices and{' '}
      {one ? 'is' : 'are'} only hidden from new bills while this {parent} is deleted. Restore the {parent} and {one ? 'it comes' : 'they come'} back
      automatically.
    </p>
  );
}
