import { describe, expect, it } from 'vitest';
import type { Category, Customer, Product, Vendor } from '../../models';
import { buildBillVendors, flattenBill, groupBillLines, quantitiesFromBill } from './billDocument';
import { calculateDiscountPercentage, calculateLine, calculateTotals } from './calculations';
import { buildCatalog } from './catalog';

const audit = { isActive: true, version: 1, createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' };
const vendor = (id: string, name: string, priority: number, isActive = true): Vendor => ({
  ...audit, _id: id, vendorId: id, vendorName: name, priority, isActive,
});
const category = (id: string, vendorId: string, name: string, priority: number, isActive = true): Category => ({
  ...audit, _id: id, vendorId, categoryName: name, priority, isActive,
});
const product = (
  id: string, vendorId: string, categoryId: string, name: string, mrp: number, sellingPrice: number, priority = 1, isActive = true,
): Product => ({
  ...audit, _id: id, vendorId, categoryId, productName: name, unit: '1 L', purchasePrice: sellingPrice - 1, mrp, sellingPrice, priority, isActive,
});

describe('calculateLine', () => {
  it('applies the spec formulas', () => {
    expect(calculateLine({ mrp: 40, sellingPrice: 39, quantity: 5 })).toEqual({
      discountAmount: 1, discountPercentage: 2.5, discountTotal: 5, mrpTotal: 200, total: 195,
    });
  });

  it('rounds discount percentage to two decimals', () => {
    expect(calculateDiscountPercentage(15, 14)).toBe(6.67);
    expect(calculateDiscountPercentage(42, 40)).toBe(4.76);
  });

  it('handles a zero MRP and never goes negative on quantity', () => {
    expect(calculateDiscountPercentage(0, 10)).toBe(0);
    expect(calculateLine({ mrp: 10, sellingPrice: 9, quantity: -3 }).total).toBe(0);
  });

  it('avoids floating-point drift', () => {
    expect(calculateLine({ mrp: 0.3, sellingPrice: 0.1, quantity: 3 }).total).toBe(0.3);
  });
});

describe('buildCatalog', () => {
  const vendors = [vendor('V2', 'Milkymist', 2), vendor('V1', 'Aavin', 1), vendor('V3', 'Old', 3, false)];
  const categories = [
    category('C2', 'V1', 'Curd', 2),
    category('C1', 'V1', 'Milk', 1),
    category('C3', 'V2', 'Milk', 1),
    category('C4', 'V1', 'Inactive', 3, false),
  ];
  const products = [
    product('P2', 'V1', 'C1', 'Milk 500 ml', 24, 23, 2),
    product('P1', 'V1', 'C1', 'Milk 1 L', 40, 39, 1),
    product('P3', 'V1', 'C2', 'Curd', 30, 28),
    product('P4', 'V2', 'C3', 'Milk 1 L', 42, 40),
    product('P5', 'V1', 'C4', 'Hidden', 10, 9),
    product('P6', 'V1', 'C1', 'Inactive product', 10, 9, 3, false),
  ];

  it('orders vendors, categories and products by priority and hides inactive records', () => {
    const catalog = buildCatalog({ vendors, categories, products });
    expect(catalog.map((v) => v.vendorName)).toEqual(['Aavin', 'Milkymist']);
    expect(catalog[0].categories.map((c) => c.categoryName)).toEqual(['Milk', 'Curd']);
    expect(catalog[0].categories[0].products.map((p) => p.productId)).toEqual(['P1', 'P2']);
  });

  it('limits vendors to those applicable to the customer', () => {
    const customer = { vendorIds: ['V2'] } as Pick<Customer, 'vendorIds'>;
    expect(buildCatalog({ vendors, categories, products, customer }).map((v) => v.vendorId)).toEqual(['V2']);
  });

  it('keeps snapshot prices for lines of a bill being edited, even if the product is now inactive', () => {
    const catalog = buildCatalog({
      vendors,
      categories,
      products: products.map((p) => (p._id === 'P1' ? { ...p, sellingPrice: 38, isActive: false } : p)),
      lockedLines: [
        {
          billId: 'B1', billNumber: 'MLB000001', billDate: '2026-10-01', itemsRevision: 'r1', lineNo: 1,
          vendorId: 'V1', vendorName: 'Aavin', vendorPriority: 1, categoryId: 'C1', categoryName: 'Milk', categoryPriority: 1,
          productId: 'P1', productName: 'Milk 1 L', unit: '1 L', purchasePrice: 37, mrp: 40, sellingPrice: 39,
          discountAmount: 1, discountPercentage: 2.5, quantity: 5, discountTotal: 5, total: 195,
        },
      ],
    });
    const locked = catalog[0].categories[0].products.find((p) => p.productId === 'P1')!;
    expect(locked).toMatchObject({ sellingPrice: 39, locked: true, available: false, currentSellingPrice: 38 });
  });
});

describe('bill document', () => {
  const catalog = buildCatalog({
    vendors: [vendor('V1', 'Aavin', 1), vendor('V2', 'Milkymist', 2)],
    categories: [category('C1', 'V1', 'Milk', 1), category('C2', 'V1', 'Buttermilk', 2), category('C3', 'V2', 'Milk', 1)],
    products: [
      product('P1', 'V1', 'C1', 'Milk 1 L', 40, 39),
      { ...product('P2', 'V1', 'C2', 'Buttermilk 200ml', 15, 14), purchasePrice: 12 },
      product('P3', 'V2', 'C3', 'Milk 1 L', 42, 40),
      product('P4', 'V2', 'C3', 'Unused', 10, 10),
    ],
  });
  const vendors = buildBillVendors(catalog, { P1: 5, P2: 10, P3: 5, P4: 0 });

  it('matches the example bill from the specification', () => {
    expect(vendors.map((v) => [v.vendorName, v.total])).toEqual([['Aavin', 335], ['Milkymist', 200]]);
    const totals = calculateTotals(vendors);
    expect(totals).toEqual({ itemCount: 3, totalQuantity: 20, mrpTotal: 560, totalDiscount: 25, subtotal: 535, grandTotal: 535 });
    expect(vendors[0].categories[1].items[0]).toMatchObject({ discountPercentage: 6.67, total: 140 });
  });

  it('round-trips through the flattened bill_items representation', () => {
    const bill = { _id: 'MLBID000001', billNumber: 'MLB000001', billDate: '2026-10-05', itemsRevision: 'rev', vendors };
    const lines = flattenBill(bill);
    expect(lines.map((line) => line.lineNo)).toEqual([1, 2, 3]);
    expect(groupBillLines([...lines].reverse())).toEqual(vendors);
    expect(quantitiesFromBill(vendors)).toEqual({ P1: 5, P2: 10, P3: 5 });
  });
});
