import {
  BarChart3,
  Building2,
  FilePlus2,
  History,
  LayoutDashboard,
  MapPinned,
  Package,
  Settings,
  Sheet,
  Store,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/domain/permissions/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  /** Match only the exact path (not children). */
  end?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/** Sidebar structure. Items are filtered by the signed-in user's permissions. */
export const NAVIGATION: NavSection[] = [
  { items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:view' }] },
  {
    title: 'Masters',
    items: [
      { to: '/masters/vendors', label: 'Vendors', icon: Building2, permission: 'vendor:view' },
      { to: '/masters/categories', label: 'Categories', icon: Tags, permission: 'category:view' },
      { to: '/masters/products', label: 'Products', icon: Package, permission: 'product:view' },
      { to: '/masters/routes', label: 'Routes', icon: MapPinned, permission: 'route:view' },
      { to: '/masters/customers', label: 'Customers', icon: Store, permission: 'customer:view' },
    ],
  },
  {
    title: 'Billing',
    items: [
      { to: '/billing/new', label: 'Create Bill', icon: FilePlus2, permission: 'bill:create' },
      { to: '/billing/history', label: 'Past Bills', icon: History, permission: 'bill:view' },
    ],
  },
  {
    title: 'Reports',
    items: [{ to: '/reports', label: 'Sales & Profit', icon: BarChart3, permission: 'report:view' }],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin/users', label: 'Users', icon: Users, permission: 'user:manage' },
      { to: '/admin/settings', label: 'Settings', icon: Settings, permission: 'settings:app:manage' },
    ],
  },
  {
    items: [{ to: '/admin/google-sheets', label: 'Google Sheets Configuration', icon: Sheet, permission: 'settings:sheets:manage' }],
  },
];
