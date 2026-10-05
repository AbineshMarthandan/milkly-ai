import { AppError } from '../errors/AppError';
import type { Actor } from '../models/common';
import type { Role } from '../models/user';

/**
 * Permission catalogue. UI (routes, menus, buttons) and application services
 * both check these, so a hidden button is never the only line of defence.
 */
export const PERMISSIONS = [
  'dashboard:view',

  'vendor:view',
  'vendor:manage',
  'category:view',
  'category:manage',
  'product:view',
  'product:manage',
  'route:view',
  'route:manage',
  'customer:view',
  'customer:manage',

  'bill:create',
  'bill:print',
  'bill:view',
  'bill:update',
  'bill:cancel',

  /** Sales & profit reports (exposes purchase prices and margins). */
  'report:view',

  'user:manage',
  'settings:app:manage',
  'settings:sheets:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEW_MASTERS: Permission[] = ['vendor:view', 'category:view', 'product:view', 'route:view', 'customer:view'];
const MANAGE_MASTERS: Permission[] = [
  'vendor:manage',
  'category:manage',
  'product:manage',
  'route:manage',
  'customer:manage',
];
const BILL_BASIC: Permission[] = ['bill:create', 'bill:print', 'bill:view'];
const BILL_ADVANCED: Permission[] = ['bill:update', 'bill:cancel'];

/** The role → permission matrix (see docs/PERMISSIONS.md). */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  TECH_ADMIN: new Set<Permission>(PERMISSIONS),
  SUPER_ADMIN: new Set<Permission>([
    'dashboard:view',
    ...VIEW_MASTERS,
    ...MANAGE_MASTERS,
    ...BILL_BASIC,
    ...BILL_ADVANCED,
    'report:view',
  ]),
  ADMIN: new Set<Permission>(['dashboard:view', ...VIEW_MASTERS, ...BILL_BASIC]),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].has(permission) : false;
}

export function canAny(role: Role | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}

export function assertCan(actor: Actor | null, permission: Permission): asserts actor is Actor {
  if (!actor) throw new AppError('AUTH_REQUIRED');
  if (!can(actor.role, permission)) {
    throw new AppError('PERMISSION_DENIED', { details: `Role ${actor.role} lacks ${permission}` });
  }
}
