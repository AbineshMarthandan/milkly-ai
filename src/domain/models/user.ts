import type { BaseEntity, IsoDateTime } from './common';

export const ROLES = ['TECH_ADMIN', 'SUPER_ADMIN', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  TECH_ADMIN: 'Tech Admin',
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  TECH_ADMIN: 'Full access, including Google Sheets connection, settings and users.',
  SUPER_ADMIN: 'Manages master data and bills. No access to system configuration.',
  ADMIN: 'Views master data, creates and prints bills, views past bills.',
};

/** An application user. Identity is the Google account e-mail. */
export interface User extends BaseEntity {
  /** Lower-cased Google account e-mail; unique. */
  email: string;
  displayName: string;
  role: Role;
  lastLoginAt: IsoDateTime | null;
}
