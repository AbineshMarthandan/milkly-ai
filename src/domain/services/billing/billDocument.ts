import type { Bill, BillCategoryGroup, BillItem, BillLine, BillVendorGroup } from '../../models/bill';
import type { EntityId } from '../../models/common';
import { roundQuantity, sumMoney } from '../money';
import { compareByPriority } from '../ordering';
import { calculateLine } from './calculations';
import type { CatalogVendor } from './catalog';

/** Quantity entered per product ID. Missing or ≤ 0 means "not on the bill". */
export type QuantityMap = Readonly<Record<EntityId, number>>;

/**
 * Builds the embedded vendor → category → item tree from what the user sees
 * (the catalogue) and the quantities they entered. Prices are snapshotted here;
 * the resulting items never change when master prices change later.
 */
export function buildBillVendors(catalog: readonly CatalogVendor[], quantities: QuantityMap): BillVendorGroup[] {
  const vendors: BillVendorGroup[] = [];
  for (const vendor of catalog) {
    const categories: BillCategoryGroup[] = [];
    for (const category of vendor.categories) {
      const items: BillItem[] = [];
      for (const product of category.products) {
        const quantity = roundQuantity(quantities[product.productId] ?? 0);
        if (!(quantity > 0)) continue;
        const amounts = calculateLine({ mrp: product.mrp, sellingPrice: product.sellingPrice, quantity });
        items.push({
          productId: product.productId,
          productName: product.productName,
          unit: product.unit,
          purchasePrice: product.purchasePrice,
          mrp: product.mrp,
          sellingPrice: product.sellingPrice,
          discountAmount: amounts.discountAmount,
          discountPercentage: amounts.discountPercentage,
          quantity,
          discountTotal: amounts.discountTotal,
          total: amounts.total,
        });
      }
      if (items.length) {
        categories.push({
          categoryId: category.categoryId,
          categoryName: category.categoryName,
          priority: category.priority,
          total: sumMoney(items.map((item) => item.total)),
          items,
        });
      }
    }
    if (categories.length) {
      vendors.push({
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        priority: vendor.priority,
        total: sumMoney(categories.map((category) => category.total)),
        categories,
      });
    }
  }
  return vendors;
}

/** Flattens a bill into rows for engines without embedded arrays (Sheets `bill_items`). */
export function flattenBill(bill: Pick<Bill, '_id' | 'billNumber' | 'billDate' | 'itemsRevision' | 'vendors'>): BillLine[] {
  const lines: BillLine[] = [];
  let lineNo = 0;
  for (const vendor of bill.vendors) {
    for (const category of vendor.categories) {
      for (const item of category.items) {
        lineNo += 1;
        lines.push({
          ...item,
          billId: bill._id,
          billNumber: bill.billNumber,
          billDate: bill.billDate,
          itemsRevision: bill.itemsRevision,
          lineNo,
          vendorId: vendor.vendorId,
          vendorName: vendor.vendorName,
          vendorPriority: vendor.priority,
          categoryId: category.categoryId,
          categoryName: category.categoryName,
          categoryPriority: category.priority,
        });
      }
    }
  }
  return lines;
}

const byLine = (a: BillLine, b: BillLine) => a.lineNo - b.lineNo;
const byVendor = compareByPriority<BillVendorGroup>((v) => v.vendorName, (v) => v.priority);
const byCategory = compareByPriority<BillCategoryGroup>((c) => c.categoryName, (c) => c.priority);

/** Inverse of `flattenBill`: rebuilds the embedded tree from stored lines. */
export function groupBillLines(lines: readonly BillLine[]): BillVendorGroup[] {
  const vendors = new Map<EntityId, BillVendorGroup>();
  const categories = new Map<string, BillCategoryGroup>();
  for (const line of [...lines].sort(byLine)) {
    let vendor = vendors.get(line.vendorId);
    if (!vendor) {
      vendor = { vendorId: line.vendorId, vendorName: line.vendorName, priority: line.vendorPriority, total: 0, categories: [] };
      vendors.set(line.vendorId, vendor);
    }
    const categoryKey = `${line.vendorId}::${line.categoryId}`;
    let category = categories.get(categoryKey);
    if (!category) {
      category = {
        categoryId: line.categoryId,
        categoryName: line.categoryName,
        priority: line.categoryPriority,
        total: 0,
        items: [],
      };
      categories.set(categoryKey, category);
      vendor.categories.push(category);
    }
    category.items.push({
      productId: line.productId,
      productName: line.productName,
      unit: line.unit,
      purchasePrice: line.purchasePrice,
      mrp: line.mrp,
      sellingPrice: line.sellingPrice,
      discountAmount: line.discountAmount,
      discountPercentage: line.discountPercentage,
      quantity: line.quantity,
      discountTotal: line.discountTotal,
      total: line.total,
    });
  }
  const result = [...vendors.values()];
  for (const vendor of result) {
    for (const category of vendor.categories) category.total = sumMoney(category.items.map((item) => item.total));
    vendor.categories.sort(byCategory);
    vendor.total = sumMoney(vendor.categories.map((category) => category.total));
  }
  return result.sort(byVendor);
}

/** Converts a saved bill back into editable quantities. */
export function quantitiesFromBill(vendors: readonly BillVendorGroup[]): Record<EntityId, number> {
  const quantities: Record<EntityId, number> = {};
  for (const vendor of vendors) {
    for (const category of vendor.categories) {
      for (const item of category.items) quantities[item.productId] = item.quantity;
    }
  }
  return quantities;
}
