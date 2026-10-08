import { Pencil, RotateCcw, UserPlus, UserX, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role, type User } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { Badge, PageHeader } from '@/components/common/Layout';
import { AddTile, CardGrid, GridSkeleton, ItemCard, SectionHeading, type CardAction } from '@/components/explorer/Explorer';
import { useConfirm } from '@/components/modals/ConfirmProvider';
import { useCurrentUser, usePermission } from '@/hooks/useSession';
import { formatDateTime } from '@/utils/format';
import { applyFilters } from '../shared/catalog';
import { ExplorerToolbar, StatusFilter } from '../shared/MasterComponents';
import type { StatusFilterValue } from '../shared/masterData';
import { useDrawer } from '../shared/useDrawer';
import { UserFormDrawer } from './UserFormDrawer';
import { useSetUserActive, useUserList } from './useUsers';

const ROLE_TONES: Record<Role, 'brand' | 'blue' | 'gray'> = { TECH_ADMIN: 'brand', SUPER_ADMIN: 'blue', ADMIN: 'gray' };

function initials(name: string, email: string) {
  return (name.match(/\p{L}+/gu) ?? [email])
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Application users as cards, grouped by role (Tech Admin only). */
export default function UsersPage() {
  const canManage = usePermission('user:manage');
  const currentUser = useCurrentUser();
  const users = useUserList();
  const setActive = useSetUserActive();
  const confirm = useConfirm();
  const drawer = useDrawer<User>();
  const [status, setStatus] = useState<StatusFilterValue>('active');
  const [search, setSearch] = useState('');

  const filtered = applyFilters(users.data ?? [], status, search, (user) => `${user.displayName} ${user.email} ${ROLE_LABELS[user.role]}`);
  const groups = ROLES.map((role) => ({
    role,
    users: filtered.filter((user) => user.role === role).sort((a, b) => a.displayName.localeCompare(b.displayName)),
  })).filter((group) => group.users.length > 0);

  const actionsFor = (user: User): CardAction[] => {
    if (!canManage) return [];
    const isSelf = user._id === currentUser?._id;
    const actions: CardAction[] = [{ label: 'Edit', icon: Pencil, onSelect: () => drawer.edit(user) }];
    if (user.isActive && !isSelf) {
      actions.push({
        label: 'Deactivate',
        icon: UserX,
        tone: 'danger',
        onSelect: async () => {
          const ok = await confirm({
            title: `Deactivate ${user.displayName}?`,
            tone: 'danger',
            confirmLabel: 'Deactivate',
            description: 'They will no longer be able to sign in. Bills and records keep their name. You can reactivate them at any time.',
          });
          if (!ok) return;
          await setActive.mutateAsync({ user, active: false }).then(() => toast.success(`${user.displayName} deactivated`), () => undefined);
        },
      });
    }
    if (!user.isActive) {
      actions.push({
        label: 'Reactivate',
        icon: RotateCcw,
        tone: 'brand',
        onSelect: () =>
          void setActive.mutateAsync({ user, active: true }).then(() => toast.success(`${user.displayName} can sign in again`), () => undefined),
      });
    }
    return actions;
  };

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Users sign in with Google. Also share the spreadsheet with their Google account (Editor) — the app role only controls what they can do inside Milkly."
        actions={
          canManage && (
            <Button icon={<UserPlus className="size-4" />} onClick={drawer.create}>
              Add user
            </Button>
          )
        }
      />
      <ExplorerToolbar search={search} onSearch={setSearch} placeholder="Search name or e-mail…">
        <StatusFilter value={status} onChange={setStatus} />
      </ExplorerToolbar>

      {users.isLoading ? (
        <GridSkeleton count={6} />
      ) : users.error ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<Users className="size-6" />} title={search ? 'No users match your search' : 'No users here'} />
      ) : (
        groups.map(({ role, users: members }, groupIndex) => (
          <section key={role} className="mb-8">
            <SectionHeading title={ROLE_LABELS[role]} count={members.length} />
            <p className="-mt-2 mb-3 text-xs text-slate-500">{ROLE_DESCRIPTIONS[role]}</p>
            <CardGrid>
              {members.map((user) => {
                const isSelf = user._id === currentUser?._id;
                return (
                  <ItemCard
                    key={user._id}
                    name={user.displayName}
                    title={
                      <span className="flex items-center gap-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
                          {initials(user.displayName, user.email)}
                        </span>
                        <span className="truncate">{user.displayName}</span>
                      </span>
                    }
                    inactive={!user.isActive}
                    badge={isSelf ? <Badge tone="brand">You</Badge> : undefined}
                    actions={actionsFor(user)}
                    onOpen={canManage ? () => drawer.edit(user) : undefined}
                    footer={
                      <>
                        <span className="font-mono">{user._id}</span>
                        <span>{user.lastLoginAt ? `Last sign-in ${formatDateTime(user.lastLoginAt)}` : 'Never signed in'}</span>
                      </>
                    }
                  >
                    <p className="truncate text-sm text-slate-600">{user.email}</p>
                    <div className="mt-2">
                      <Badge tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                    </div>
                  </ItemCard>
                );
              })}
              {canManage && groupIndex === groups.length - 1 && status !== 'inactive' && !search && (
                <AddTile label="New user" onClick={drawer.create} />
              )}
            </CardGrid>
          </section>
        ))
      )}

      <UserFormDrawer open={drawer.open} user={drawer.item} onClose={drawer.close} />
    </>
  );
}
