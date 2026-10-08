import type { BillLine } from '../../models/bill';
import type { EntityId } from '../../models/common';
import type { Category, Customer, Product, Vendor } from '../../models/masterData';
import { compareByPriority } from '../ordering';

/**
 * The billing catalogue: every product that can be put on a bill for a given
 * customer, grouped vendor → category → product and ordered by priority.
 */
export interface CatalogProduct {
  productId: EntityId;
  productName: string;
  unit: string;
  purchasePrice: number;
  mrp: number;
  sellingPrice: number;
  priority: number;
  /**
   * `true` when the price comes from the bill being edited (historical
   * snapshot) instead of the current product master.
   */
  locked: boolean;
  /** Current master prices, when they differ from a locked snapshot. */
  currentMrp?: number;
  currentSellingPrice?: number;
  /** `false` when the product is inactive/removed but still on the bill being edited. */
  available: boolean;
}

export interface CatalogCategory {
  categoryId: EntityId;
  categoryName: string;
  priority: number;
  products: CatalogProduct[];
}

export interface CatalogVendor {
  vendorId: EntityId;
  vendorName: string;
  priority: number;
  categories: CatalogCategory[];
}

export interface BuildCatalogInput {
  vendors: readonly Vendor[];
  categories: readonly Category[];
  products: readonly Product[];
  /** Limits vendors to `customer.vendorIds` when that list is not empty. */
  customer?: Pick<Customer, 'vendorIds'> | null;
  /** Lines of the bill being edited; their snapshot prices win over the master. */
  lockedLines?: readonly BillLine[];
}

/** Keeps saved bill lines ahead of (and in their original order relative to) newly added products. */
const LOCKED_ORDER_OFFSET = 1_000_000;

const byVendor = compareByPriority<CatalogVendor>((v) => v.vendorName, (v) => v.priority);
const byCategory = compareByPriority<CatalogCategory>((c) => c.categoryName, (c) => c.priority);
const byProduct = compareByPriority<CatalogProduct>((p) => `${p.productName} ${p.unit}`, (p) => p.priority);

export function buildCatalog({ vendors, categories, products, customer, lockedLines = [] }: BuildCatalogInput): CatalogVendor[] {
  const applicable = customer?.vendorIds.length ? new Set(customer.vendorIds) : null;
  const vendorMap = new Map<EntityId, CatalogVendor>();
  const categoryMap = new Map<EntityId, CatalogCategory>();
  const vendorById = new Map(vendors.map((vendor) => [vendor._id, vendor]));
  const categoryById = new Map(categories.map((category) => [category._id, category]));
  const productById = new Map(products.map((product) => [product._id, product]));

  const ensureVendor = (id: EntityId, name: string, priority: number): CatalogVendor => {
    let entry = vendorMap.get(id);
    if (!entry) {
      entry = { vendorId: id, vendorName: name, priority, categories: [] };
      vendorMap.set(id, entry);
    }
    return entry;
  };
  const ensureCategory = (vendor: CatalogVendor, id: EntityId, name: string, priority: number): CatalogCategory => {
    let entry = categoryMap.get(id);
    if (!entry) {
      entry = { categoryId: id, categoryName: name, priority, products: [] };
      categoryMap.set(id, entry);
      vendor.categories.push(entry);
    }
    return entry;
  };

  // 1. Lines already on a saved bill keep everything exactly as saved — names,
  //    order and prices — even if the master was renamed, re-prioritised or
  //    deleted since. History is never rewritten by editing a bill.
  const lockedIds = new Set<EntityId>();
  for (const line of lockedLines) {
    lockedIds.add(line.productId);
    const vendor = ensureVendor(line.vendorId, line.vendorName, line.vendorPriority);
    const category = ensureCategory(vendor, line.categoryId, line.categoryName, line.categoryPriority);
    const master = productById.get(line.productId);
    const priceChanged = master && (master.mrp !== line.mrp || master.sellingPrice !== line.sellingPrice);
    category.products.push({
      productId: line.productId,
      productName: line.productName,
      unit: line.unit,
      purchasePrice: line.purchasePrice,
      mrp: line.mrp,
      sellingPrice: line.sellingPrice,
      // Saved lines keep their saved order and sort before products added during the edit.
      priority: line.lineNo - LOCKED_ORDER_OFFSET,
      locked: true,
      currentMrp: priceChanged ? master.mrp : undefined,
      currentSellingPrice: priceChanged ? master.sellingPrice : undefined,
      available: Boolean(master?.isActive),
    });
  }

  // 2. Every active product of every active, applicable vendor and category.
  for (const product of products) {
    if (!product.isActive || lockedIds.has(product._id)) continue;
    const vendor = vendorById.get(product.vendorId);
    const category = categoryById.get(product.categoryId);
    if (!vendor?.isActive || !category?.isActive || category.vendorId !== vendor._id) continue;
    if (applicable && !applicable.has(vendor._id)) continue;
    const vendorEntry = ensureVendor(vendor._id, vendor.vendorName, vendor.priority);
    const categoryEntry = ensureCategory(vendorEntry, category._id, category.categoryName, category.priority);
    categoryEntry.products.push({
      productId: product._id,
      productName: product.productName,
      unit: product.unit,
      purchasePrice: product.purchasePrice,
      mrp: product.mrp,
      sellingPrice: product.sellingPrice,
      priority: product.priority,
      locked: false,
      available: true,
    });
  }

  const result = [...vendorMap.values()].filter((vendor) => vendor.categories.length > 0);
  for (const vendor of result) {
    vendor.categories.sort(byCategory);
    for (const category of vendor.categories) category.products.sort(byProduct);
  }
  return result.sort(byVendor);
}

/** Flat lookup of catalog products by ID. */
export function indexCatalog(catalog: readonly CatalogVendor[]): Map<EntityId, CatalogProduct> {
  const index = new Map<EntityId, CatalogProduct>();
  for (const vendor of catalog) {
    for (const category of vendor.categories) {
      for (const product of category.products) index.set(product.productId, product);
    }
  }
  return index;
}
