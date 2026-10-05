import { Pencil, RotateCcw, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { IconButton } from '@/components/common/Button';
import { SegmentedControl } from '@/components/common/Layout';
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

interface RowActionsProps {
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
 * Edit / Delete / Restore buttons for a master-data row. "Delete" is always a
 * soft delete: the record is deactivated, hidden from billing, and can be
 * restored. Historical bills keep their own snapshot.
 */
export function RowActions({ entityLabel, name, isActive, canManage, onEdit, onSetActive, deleteNote }: RowActionsProps) {
  const confirm = useConfirm();
  if (!canManage) return null;

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

  return (
    <div className="flex justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
      <IconButton label={`Edit ${name}`} onClick={onEdit}>
        <Pencil className="size-4" />
      </IconButton>
      {isActive ? (
        <IconButton label={`Delete ${name}`} tone="danger" onClick={() => void remove()}>
          <Trash2 className="size-4" />
        </IconButton>
      ) : (
        <IconButton label={`Restore ${name}`} tone="brand" onClick={() => void restore()}>
          <RotateCcw className="size-4" />
        </IconButton>
      )}
    </div>
  );
}

export function IdCell({ id }: { id: string }) {
  return <span className="font-mono text-xs text-slate-500">{id}</span>;
}
