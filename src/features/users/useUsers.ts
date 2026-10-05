import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntityId, User } from '@/domain/models';
import type { UserFormValues } from '@/domain/validation/schemas';
import { queryKeys } from '@/constants/queryKeys';
import { useServices } from '@/hooks/useSession';
import { sessionManager } from '@/app/store/sessionManager';

/*
 * Users are not a master collection (only Tech Admins may list them), so they
 * get their own small set of hooks instead of `useMasterList` & co.
 * Invalidating `queryKeys.users` also refreshes the user directory
 * (`['users', 'directory']`) used for "Created by" names.
 */

export function useUserList() {
  const services = useServices();
  return useQuery({ queryKey: queryKeys.users, queryFn: () => services.users.list() });
}

/** Create or update; the form shows errors itself. */
export function useSaveUser() {
  const services = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, values, version }: { id?: EntityId; values: UserFormValues; version?: number }) =>
      id ? services.users.update(id, values, version) : services.users.create(values),
    onSuccess: (user) => {
      sessionManager.syncCurrentUser(user);
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

/** Deactivate (the user can no longer sign in) or reactivate. Never a physical delete. */
export function useSetUserActive() {
  const services = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ user, active }: { user: User; active: boolean }) =>
      active ? services.users.reactivate(user._id, user.version) : services.users.deactivate(user._id, user.version),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  });
}
