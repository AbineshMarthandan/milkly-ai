import type { BaseEntity, EntityId } from './common';

/** A supplier whose products are resold (e.g. Aavin, Milkymist). */
export interface Vendor extends BaseEntity {
  /** Business key; identical to `_id` (kept as an explicit field for exports and migrations). */
  vendorId: EntityId;
  vendorName: string;
  /** 1 = first. Controls vendor order on bills. */
  priority: number;
}

/** A product group that belongs to exactly one vendor (e.g. Aavin → Milk). */
export interface Category extends BaseEntity {
  vendorId: EntityId;
  categoryName: string;
  /** Controls category order inside its vendor on bills. */
  priority: number;
}

export interface Product extends BaseEntity {
  vendorId: EntityId;
  categoryId: EntityId;
  productName: string;
  /** Free-text pack size, e.g. `1 L`, `500 ml`, `200 g`. */
  unit: string;
  purchasePrice: number;
  mrp: number;
  sellingPrice: number;
  /** Controls product order inside its category on bills. */
  priority: number;
}

/** A delivery route that groups customers/stores. */
export interface Route extends BaseEntity {
  routeName: string;
  /** Short unique code printed on bills, e.g. `R-A`. */
  routeCode: string;
  priority: number;
}

/** A store/customer that is served on one route. */
export interface Customer extends BaseEntity {
  /** Business key; identical to `_id`. */
  customerId: EntityId;
  routeId: EntityId;
  storeName: string;
  contactPerson: string;
  phone: string;
  address: string;
  /** Controls customer order within the route. */
  priority: number;
  /** Vendors supplied to this customer. Empty means "all active vendors". */
  vendorIds: EntityId[];
}
