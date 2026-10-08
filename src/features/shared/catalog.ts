import { useMemo } from 'react';
import type { Category, Customer, EntityId, Product, Route, Vendor } from '@/domain/models';
import { sortByPriority } from '@/domain/services/ordering';
import { accentFor, type Accent } from '@/components/explorer/Explorer';
import { filterByStatus, useMasterList, type StatusFilterValue } from './masterData';

/**
 * Vendor → category → product tree in priority order, built from the cached
 * master lists (no extra API calls). Every folder/card screen reads from it.
 */
export function useCatalog() {
  const vendors = useMasterList('vendors');
  const categories = useMasterList('categories');
  const products = useMasterList('products');

  const index = useMemo(() => {
    const sortedVendors = sortByPriority(vendors.data ?? [], (vendor) => vendor.vendorName);
    const vendorById = new Map(sortedVendors.map((vendor) => [vendor._id, vendor]));
    const accentById = new Map<EntityId, Accent>(sortedVendors.map((vendor, i) => [vendor._id, accentFor(i)]));

    const categoriesByVendor = new Map<EntityId, Category[]>();
    for (const category of sortByPriority(categories.data ?? [], (c) => c.categoryName)) {
      categoriesByVendor.set(category.vendorId, [...(categoriesByVendor.get(category.vendorId) ?? []), category]);
    }
    const categoryById = new Map((categories.data ?? []).map((category) => [category._id, category]));

    const productsByCategory = new Map<EntityId, Product[]>();
    for (const product of sortByPriority(products.data ?? [], (p) => `${p.productName} ${p.unit}`)) {
      productsByCategory.set(product.categoryId, [...(productsByCategory.get(product.categoryId) ?? []), product]);
    }

    return {
      vendors: sortedVendors,
      vendorById,
      categoryById,
      accentOf: (vendorId: EntityId) => accentById.get(vendorId) ?? accentFor(0),
      categoriesOf: (vendorId: EntityId) => categoriesByVendor.get(vendorId) ?? [],
      productsOf: (categoryId: EntityId) => productsByCategory.get(categoryId) ?? [],
      /** Products of a vendor, in category order then product order. */
      productsOfVendor: (vendorId: EntityId) =>
        (categoriesByVendor.get(vendorId) ?? []).flatMap((category) => productsByCategory.get(category._id) ?? []),
    };
  }, [vendors.data, categories.data, products.data]);

  return {
    ...index,
    isLoading: vendors.isLoading || categories.isLoading || products.isLoading,
    error: vendors.error ?? categories.error ?? products.error,
    refetch: () => Promise.all([vendors.refetch(), categories.refetch(), products.refetch()]),
  };
}

/** Route → store tree in delivery (priority) order. */
export function useRouteBook() {
  const routes = useMasterList('routes');
  const customers = useMasterList('customers');
  const vendors = useMasterList('vendors');

  const index = useMemo(() => {
    const sortedRoutes = sortByPriority(routes.data ?? [], (route) => route.routeName);
    const routeById = new Map(sortedRoutes.map((route) => [route._id, route]));
    const accentById = new Map<EntityId, Accent>(sortedRoutes.map((route, i) => [route._id, accentFor(i + 2)]));
    const customersByRoute = new Map<EntityId, Customer[]>();
    for (const customer of sortByPriority(customers.data ?? [], (c) => c.storeName)) {
      customersByRoute.set(customer.routeId, [...(customersByRoute.get(customer.routeId) ?? []), customer]);
    }
    const vendorNames = new Map((vendors.data ?? []).map((vendor) => [vendor._id, vendor.vendorName]));
    return {
      routes: sortedRoutes,
      routeById,
      accentOf: (routeId: EntityId) => accentById.get(routeId) ?? accentFor(2),
      customersOf: (routeId: EntityId) => customersByRoute.get(routeId) ?? [],
      vendorNamesOf: (customer: Customer) => customer.vendorIds.map((id) => vendorNames.get(id) ?? id),
    };
  }, [routes.data, customers.data, vendors.data]);

  return {
    ...index,
    isLoading: routes.isLoading || customers.isLoading,
    error: routes.error ?? customers.error,
    refetch: () => Promise.all([routes.refetch(), customers.refetch()]),
  };
}

/** Status + text filter used by every explorer screen. */
export function applyFilters<T extends { isActive: boolean }>(items: readonly T[], status: StatusFilterValue, search: string, text: (item: T) => string): T[] {
  const needle = search.trim().toLowerCase();
  return filterByStatus(items, status).filter((item) => !needle || text(item).toLowerCase().includes(needle));
}

export const productText = (product: Product) => `${product.productName} ${product.unit} ${product._id}`;
export const customerText = (customer: Customer) =>
  `${customer.storeName} ${customer.contactPerson} ${customer.phone} ${customer.address} ${customer._id}`;
export const vendorText = (vendor: Vendor) => `${vendor.vendorName} ${vendor._id}`;
export const routeText = (route: Route) => `${route.routeName} ${route.routeCode} ${route._id}`;

export function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}
