import { lazy, type ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router';
import type { Permission } from '@/domain/permissions/permissions';
import { AppLayout } from '../layout/AppLayout';
import { NotFoundPage } from './NotFoundPage';
import { RequirePermission, RequireSession } from './guards';

// Route-level code splitting: each screen is downloaded only when visited.
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const SetupPage = lazy(() => import('@/features/auth/SetupPage'));
const InitializePage = lazy(() => import('@/features/auth/InitializePage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const VendorsPage = lazy(() => import('@/features/vendors/VendorsPage'));
const CategoriesPage = lazy(() => import('@/features/categories/CategoriesPage'));
const VendorCategoriesPage = lazy(() => import('@/features/categories/VendorCategoriesPage'));
const ProductsPage = lazy(() => import('@/features/products/ProductsPage'));
const VendorProductsPage = lazy(() => import('@/features/products/VendorProductsPage'));
const RoutesPage = lazy(() => import('@/features/routes/RoutesPage'));
const CustomersPage = lazy(() => import('@/features/customers/CustomersPage'));
const RouteCustomersPage = lazy(() => import('@/features/customers/RouteCustomersPage'));
const CreateBillPage = lazy(() => import('@/features/billing/CreateBillPage'));
const EditBillPage = lazy(() => import('@/features/billing/EditBillPage'));
const PastBillsPage = lazy(() => import('@/features/pastBills/PastBillsPage'));
const BillDetailPage = lazy(() => import('@/features/pastBills/BillDetailPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const UsersPage = lazy(() => import('@/features/users/UsersPage'));
const AppSettingsPage = lazy(() => import('@/features/settings/AppSettingsPage'));
const GoogleSheetsPage = lazy(() => import('@/features/settings/GoogleSheetsPage'));

const guard = (permission: Permission, element: ReactNode) => <RequirePermission permission={permission}>{element}</RequirePermission>;

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/setup', element: <SetupPage /> },
  { path: '/initialize', element: <InitializePage /> },
  {
    path: '/',
    element: (
      <RequireSession>
        <AppLayout />
      </RequireSession>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: guard('dashboard:view', <DashboardPage />) },
      { path: 'masters/vendors', element: guard('vendor:view', <VendorsPage />) },
      { path: 'masters/categories', element: guard('category:view', <CategoriesPage />) },
      { path: 'masters/categories/:vendorId', element: guard('category:view', <VendorCategoriesPage />) },
      { path: 'masters/products', element: guard('product:view', <ProductsPage />) },
      { path: 'masters/products/:vendorId', element: guard('product:view', <VendorProductsPage />) },
      { path: 'masters/routes', element: guard('route:view', <RoutesPage />) },
      { path: 'masters/customers', element: guard('customer:view', <CustomersPage />) },
      { path: 'masters/customers/:routeId', element: guard('customer:view', <RouteCustomersPage />) },
      { path: 'billing/new', element: guard('bill:create', <CreateBillPage />) },
      { path: 'billing/edit/:billId', element: guard('bill:update', <EditBillPage />) },
      { path: 'billing/history', element: guard('bill:view', <PastBillsPage />) },
      { path: 'billing/history/:billId', element: guard('bill:view', <BillDetailPage />) },
      { path: 'reports', element: guard('report:view', <ReportsPage />) },
      { path: 'admin/users', element: guard('user:manage', <UsersPage />) },
      { path: 'admin/settings', element: guard('settings:app:manage', <AppSettingsPage />) },
      { path: 'admin/google-sheets', element: guard('settings:sheets:manage', <GoogleSheetsPage />) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
], {
  // Matches Vite's `base`, so the app also works under a sub-path (GitHub Pages).
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
});
