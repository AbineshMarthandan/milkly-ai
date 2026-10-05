import { useCallback } from 'react';
import { AppError } from '@/domain/errors/AppError';
import { can, type Permission } from '@/domain/permissions/permissions';
import type { AppServices } from '@/domain/services';
import { useSessionStore } from '@/app/store/sessionStore';

/** Application services for the signed-in user. Only usable inside the authenticated layout. */
export function useServices(): AppServices {
  const services = useSessionStore((state) => state.services);
  if (!services) throw new AppError('AUTH_REQUIRED');
  return services;
}

export function useCurrentUser() {
  return useSessionStore((state) => state.user);
}

/** Component-level authorisation check. */
export function useCan(): (permission: Permission) => boolean {
  const role = useSessionStore((state) => state.user?.role);
  return useCallback((permission: Permission) => can(role, permission), [role]);
}

export function usePermission(permission: Permission): boolean {
  return useCan()(permission);
}
