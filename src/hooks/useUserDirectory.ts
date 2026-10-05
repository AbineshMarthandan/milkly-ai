import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '@/constants/queryKeys';
import { useServices } from './useSession';

/** Resolves user IDs in audit fields (createdBy/updatedBy) to display names. */
export function useUserName(): (userId: string | null | undefined, fallback?: string) => string {
  const services = useServices();
  const { data } = useQuery({
    queryKey: queryKeys.userDirectory,
    queryFn: () => services.users.directory(),
    staleTime: 10 * 60_000,
  });
  return useCallback(
    (userId, fallback) => (userId ? (data?.get(userId) ?? fallback ?? userId) : (fallback ?? '—')),
    [data],
  );
}
