import { createColumnHelper } from '@tanstack/react-table';
import { Pencil, Plus, RotateCcw, UserPlus, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ROLE_LABELS, ROLES, type Role, type User } from '@/domain/models';
import { Button, IconButton } from '@/components/common/Button';
import { Badge, Card, PageHeader, StatusBadge } from '@/components/common/Layout';
import { useConfirm } from '@/components/modals/ConfirmProvider';
import { DataTable } from '@/components/tables/DataTable';
import { useCurrentUser, usePermission } from '@/hooks/useSession';
import { formatDateTime } from '@/utils/format';
import { StatusFilter } from '../shared/MasterComponents';
import { filterByStatus, type StatusFilterValue } from '../shared/masterData';
import { UserFormDrawer } from './UserFormDrawer';
import { useSetUserActive, useUserList } from './useUsers';

const ROLE_TONES: Record<Role, 'brand' | 'blue' | 'gray'> = { TECH_ADMIN: 'brand', SUPER_ADMIN: 'blue', ADMIN: 'gray' };

const column = createColumnHelper<User & { roleLabel: string; isSelf: boolean }>();

export default function UsersPage() {
  const canManage = usePermission('user:manage');
  const currentUser = useCurrentUser();
  const users = useUserList();
  const setActive = useSetUserActive();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [editing, setEditing] = useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openEditor = (user: User | null) => {
    setEditing(user);
    setDrawerOpen(true);
  };

  // Highest role first, then by name.
  const rows = useMemo(
    () =>
      filterByStatus(users.data ?? [], status)
        .sort(
          (a, b) =>
            ROLES.indexOf(a.role) - ROLES.indexOf(b.role) ||
            a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
        )
        .map((user) => ({ ...user, roleLabel: ROLE_LABELS[user.role], isSelf: user._id === currentUser?._id })),
    [users.data, status, currentUser],
  );

  const columns = useMemo(
    () => [
      column.accessor('displayName', {
        header: 'Name',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            <span className="font-medium text-slate-900">{row.original.displayName}</span>
            {row.original.isSelf && <Badge tone="brand">You</Badge>}
          </span>
        ),
      }),
      column.accessor('email', { header: 'E-mail', cell: (info) => <span className="text-slate-600">{info.getValue()}</span> }),
      column.accessor('roleLabel', {
        header: 'Role',
        cell: ({ row }) => <Badge tone={ROLE_TONES[row.original.role]}>{row.original.roleLabel}</Badge>,
      }),
      column.accessor('lastLoginAt', {
        header: 'Last login',
        cell: (info) => {
          const value = info.getValue();
          return <span className="text-xs text-slate-500">{value ? formatDateTime(value) : 'Never'}</span>;
        },
        meta: { hideOnMobile: true },
      }),
      column.accessor('isActive', { header: 'Status', cell: (info) => <StatusBadge active={info.getValue()} /> }),
      column.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) =>
          canManage ? (
            <UserActions
              user={row.original}
              isSelf={row.original.isSelf}
              onEdit={() => openEditor(row.original)}
              onSetActive={(active) => setActive.mutateAsync({ user: row.original, active })}
            />
          ) : null,
      }),
    ],
    [canManage, setActive],
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="Users sign in with Google. Also share the spreadsheet with their Google account (Editor) — the app role only controls what they can do inside Milkly."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={() => openEditor(null)}>
              Add user
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          data={rows}
          columns={columns}
          loading={users.isLoading}
          error={users.error}
          onRetry={() => void users.refetch()}
          searchPlaceholder="Search users…"
          toolbar={<StatusFilter value={status} onChange={setStatus} />}
          getRowId={(user) => user._id}
          rowClassName={(user) => (user.isActive ? undefined : 'opacity-60')}
          emptyTitle={status === 'inactive' ? 'No inactive users' : 'No users yet'}
          emptyDescription="Add the Google accounts of the people who work in Milkly."
          emptyAction={
            canManage && status !== 'inactive' ? (
              <Button icon={<UserPlus className="size-4" />} onClick={() => openEditor(null)}>
                Add a user
              </Button>
            ) : undefined
          }
        />
      </Card>
      <UserFormDrawer open={drawerOpen} user={editing} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

interface UserActionsProps {
  user: User;
  /** The signed-in user: can be edited, never deactivated. */
  isSelf: boolean;
  onEdit: () => void;
  /** Deactivate (`active = false`) or reactivate (`active = true`). */
  onSetActive: (active: boolean) => Promise<unknown>;
}

/**
 * Edit / Deactivate / Reactivate for a user row. Like master data, users are
 * never deleted: a deactivated user cannot sign in, but bills and audit
 * history keep showing their name.
 */
function UserActions({ user, isSelf, onEdit, onSetActive }: UserActionsProps) {
  const confirm = useConfirm();

  const deactivate = async () => {
    const ok = await confirm({
      title: 'Deactivate user?',
      tone: 'danger',
      confirmLabel: 'Deactivate',
      description: (
        <div className="space-y-2">
          <p>
            <b>{user.displayName}</b> ({user.email}) will no longer be able to sign in to Milkly. Bills and history keep their name, and you can
            reactivate the account at any time from the “Inactive” filter.
          </p>
          <p className="text-xs text-slate-500">To also remove access to the data itself, stop sharing the spreadsheet with this Google account.</p>
        </div>
      ),
    });
    if (!ok) return;
    try {
      await onSetActive(false);
      toast.success(`${user.displayName} deactivated`);
    } catch {
      /* error toast shown by the mutation cache */
    }
  };

  const reactivate = async () => {
    try {
      await onSetActive(true);
      toast.success(`${user.displayName} reactivated`);
    } catch {
      /* error toast shown by the mutation cache */
    }
  };

  return (
    <div className="flex justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
      <IconButton label={`Edit ${user.displayName}`} onClick={onEdit}>
        <Pencil className="size-4" />
      </IconButton>
      {isSelf ? (
        // Keeps the Edit buttons aligned; you cannot deactivate yourself.
        <span className="size-8" aria-hidden />
      ) : user.isActive ? (
        <IconButton label={`Deactivate ${user.displayName}`} tone="danger" onClick={() => void deactivate()}>
          <UserX className="size-4" />
        </IconButton>
      ) : (
        <IconButton label={`Reactivate ${user.displayName}`} tone="brand" onClick={() => void reactivate()}>
          <RotateCcw className="size-4" />
        </IconButton>
      )}
    </div>
  );
}
