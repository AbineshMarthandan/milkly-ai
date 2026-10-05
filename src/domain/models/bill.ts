import type { BaseEntity, EntityId, IsoDate, IsoDateTime } from './common';

/**
 * Lifecycle of a bill.
 *
 * - `draft`: being edited. Drafts live on the client and are never listed in Past Bills.
 * - `finalized`: explicitly saved. Has a bill number and appears in Past Bills.
 * - `cancelled`: soft-deleted finalized bill. Kept for audit; number is never reused.
 *
 * Printing never changes the status.
 */
export const BILL_STATUSES = ['draft', 'finalized', 'cancelled'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

/**
 * A product line, frozen at the moment the bill is saved. Later master-data
 * price changes never touch it.
 */
export interface BillItem {
  productId: EntityId;
  productName: string;
  unit: string;
  purchasePrice: number;
  mrp: number;
  sellingPrice: number;
  /** Per unit: `mrp - sellingPrice`. */
  discountAmount: number;
  /** `((mrp - sellingPrice) / mrp) * 100`, rounded to 2 decimals. */
  discountPercentage: number;
  quantity: number;
  /** `discountAmount * quantity`. */
  discountTotal: number;
  /** `sellingPrice * quantity`. */
  total: number;
}

export interface BillCategoryGroup {
  categoryId: EntityId;
  categoryName: string;
  priority: number;
  total: number;
  items: BillItem[];
}

export interface BillVendorGroup {
  vendorId: EntityId;
  vendorName: string;
  priority: number;
  total: number;
  categories: BillCategoryGroup[];
}

export interface BillCustomerSnapshot {
  customerId: EntityId;
  storeName: string;
  contactPerson: string;
  phone: string;
  address: string;
  routeId: EntityId;
}

export interface BillRouteSnapshot {
  routeId: EntityId;
  routeName: string;
  routeCode: string;
}

/** Per-vendor roll-up kept on the header so lists/dashboards never need line items. */
export interface BillVendorSummary {
  vendorId: EntityId;
  vendorName: string;
  itemCount: number;
  total: number;
}

export interface BillTotals {
  itemCount: number;
  totalQuantity: number;
  /** Σ mrp × quantity. */
  mrpTotal: number;
  /** Σ (mrp − sellingPrice) × quantity. */
  totalDiscount: number;
  /** Σ sellingPrice × quantity. */
  subtotal: number;
  /** Amount payable. Equal to subtotal today; adjustments (tax, round-off) would apply here. */
  grandTotal: number;
}

/** Bill without its line items — what lists, filters and dashboards work with. */
export interface BillHeader extends BaseEntity, BillTotals {
  /** Human-facing number, e.g. `MLB000001`. Shares the counter with `_id` (`MLBID000001`). */
  billNumber: string;
  billDate: IsoDate;
  status: BillStatus;
  routeId: EntityId;
  customerId: EntityId;
  routeSnapshot: BillRouteSnapshot;
  customerSnapshot: BillCustomerSnapshot;
  vendorIds: EntityId[];
  vendorSummary: BillVendorSummary[];
  notes: string;
  /** Identifies the current set of line items; changes on every edit. */
  itemsRevision: string;
  finalizedAt: IsoDateTime | null;
  finalizedBy: EntityId | null;
  finalizedByName: string;
  createdByName: string;
  cancelledAt: IsoDateTime | null;
  cancelledBy: EntityId | null;
  cancelReason: string;
}

/** The complete MongoDB-style bill document with embedded vendor → category → item tree. */
export interface Bill extends BillHeader {
  vendors: BillVendorGroup[];
}

/**
 * A flattened bill line, used for analytics and by persistence engines that
 * cannot embed arrays (the Google Sheets `bill_items` collection).
 */
export interface BillLine extends BillItem {
  billId: EntityId;
  billNumber: string;
  billDate: IsoDate;
  itemsRevision: string;
  lineNo: number;
  vendorId: EntityId;
  vendorName: string;
  vendorPriority: number;
  categoryId: EntityId;
  categoryName: string;
  categoryPriority: number;
}
