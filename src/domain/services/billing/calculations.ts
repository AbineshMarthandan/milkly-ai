import type { BillItem, BillTotals, BillVendorGroup, BillVendorSummary } from '../../models/bill';
import { roundMoney, roundPercentage, roundQuantity, sumMoney, sumQuantity } from '../money';

export interface LinePricing {
  mrp: number;
  sellingPrice: number;
  quantity: number;
}

export interface LineAmounts {
  /** Per unit: MRP − selling price. */
  discountAmount: number;
  /** ((MRP − selling price) / MRP) × 100. Zero when MRP is zero. */
  discountPercentage: number;
  /** discountAmount × quantity. */
  discountTotal: number;
  /** MRP × quantity. */
  mrpTotal: number;
  /** selling price × quantity. */
  total: number;
}

export function calculateDiscountPercentage(mrp: number, sellingPrice: number): number {
  if (mrp <= 0) return 0;
  return roundPercentage(((mrp - sellingPrice) / mrp) * 100);
}

export function calculateLine({ mrp, sellingPrice, quantity }: LinePricing): LineAmounts {
  const qty = roundQuantity(Math.max(0, quantity));
  const discountAmount = roundMoney(mrp - sellingPrice);
  return {
    discountAmount,
    discountPercentage: calculateDiscountPercentage(mrp, sellingPrice),
    discountTotal: roundMoney(discountAmount * qty),
    mrpTotal: roundMoney(mrp * qty),
    total: roundMoney(sellingPrice * qty),
  };
}

export function allItems(vendors: readonly BillVendorGroup[]): BillItem[] {
  return vendors.flatMap((vendor) => vendor.categories.flatMap((category) => category.items));
}

export function calculateTotals(vendors: readonly BillVendorGroup[]): BillTotals {
  const items = allItems(vendors);
  const subtotal = sumMoney(items.map((item) => item.total));
  return {
    itemCount: items.length,
    totalQuantity: sumQuantity(items.map((item) => item.quantity)),
    mrpTotal: sumMoney(items.map((item) => roundMoney(item.mrp * item.quantity))),
    totalDiscount: sumMoney(items.map((item) => item.discountTotal)),
    subtotal,
    grandTotal: subtotal,
  };
}

export function summarizeVendors(vendors: readonly BillVendorGroup[]): BillVendorSummary[] {
  return vendors.map((vendor) => ({
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    itemCount: vendor.categories.reduce((count, category) => count + category.items.length, 0),
    total: vendor.total,
  }));
}
