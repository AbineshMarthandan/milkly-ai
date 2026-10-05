/**
 * Google Sheets physical schema.
 *
 * One tab per collection. Row 1 holds field names (exactly the document keys),
 * every following row is one document. Columns are matched by NAME, not by
 * position, so a human re-ordering columns does not corrupt data; missing
 * columns are reported by "Validate sheet structure" and added by "Repair".
 *
 * Values are written with `valueInputOption=RAW`, so text that looks like a
 * number, date or formula (`=...`) is stored verbatim — no formula injection.
 */
export type ColumnType = 'string' | 'number' | 'boolean' | 'json' | 'datetime' | 'date';

export interface ColumnDef {
  key: string;
  type: ColumnType;
  /** Value used when the cell is empty (e.g. a row typed in by hand). */
  defaultValue?: unknown;
  /** Storage-only column that is not part of the domain document. */
  internal?: boolean;
}

export interface SheetSchema {
  /** Tab name = collection name. */
  name: CollectionName;
  columns: readonly ColumnDef[];
}

export const COLLECTIONS = [
  'vendors',
  'categories',
  'products',
  'routes',
  'customers',
  'bills',
  'bill_items',
  'users',
  'settings',
  'sequences',
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

/** Bump when the physical layout changes; recorded in settings/database. */
export const SCHEMA_VERSION = 1;

const s = (key: string): ColumnDef => ({ key, type: 'string' });
const n = (key: string): ColumnDef => ({ key, type: 'number' });
const j = (key: string, defaultValue: unknown = null): ColumnDef => ({ key, type: 'json', defaultValue });
const dt = (key: string): ColumnDef => ({ key, type: 'datetime' });
const d = (key: string): ColumnDef => ({ key, type: 'date' });

/** Trailing columns shared by every collection. */
const SYSTEM_COLUMNS: ColumnDef[] = [{ key: 'isActive', type: 'boolean', defaultValue: true }, n('version'), dt('createdAt'), s('createdBy'), dt('updatedAt'), s('updatedBy')];

function define(name: CollectionName, columns: ColumnDef[]): SheetSchema {
  return { name, columns: [s('_id'), ...columns, ...SYSTEM_COLUMNS] };
}

export const SHEET_SCHEMAS: Record<CollectionName, SheetSchema> = {
  vendors: define('vendors', [s('vendorId'), s('vendorName'), n('priority')]),

  categories: define('categories', [s('vendorId'), s('categoryName'), n('priority')]),

  products: define('products', [
    s('vendorId'),
    s('categoryId'),
    s('productName'),
    s('unit'),
    n('purchasePrice'),
    n('mrp'),
    n('sellingPrice'),
    n('priority'),
  ]),

  routes: define('routes', [s('routeCode'), s('routeName'), n('priority')]),

  customers: define('customers', [
    s('customerId'),
    s('routeId'),
    s('storeName'),
    s('contactPerson'),
    s('phone'),
    s('address'),
    n('priority'),
    j('vendorIds', []),
  ]),

  bills: define('bills', [
    s('billNumber'),
    d('billDate'),
    s('status'),
    s('routeId'),
    s('customerId'),
    j('routeSnapshot', {}),
    j('customerSnapshot', {}),
    j('vendorIds', []),
    j('vendorSummary', []),
    n('itemCount'),
    n('totalQuantity'),
    n('mrpTotal'),
    n('totalDiscount'),
    n('subtotal'),
    n('grandTotal'),
    s('notes'),
    s('itemsRevision'),
    // A1 range of this revision's rows in bill_items: lets one small read fetch
    // a bill's lines instead of scanning the whole collection.
    { key: '_itemsRange', type: 'string', internal: true },
    dt('finalizedAt'),
    s('finalizedBy'),
    s('finalizedByName'),
    s('createdByName'),
    dt('cancelledAt'),
    s('cancelledBy'),
    s('cancelReason'),
  ]),

  bill_items: define('bill_items', [
    s('billId'),
    s('billNumber'),
    d('billDate'),
    s('itemsRevision'),
    n('lineNo'),
    s('vendorId'),
    s('vendorName'),
    n('vendorPriority'),
    s('categoryId'),
    s('categoryName'),
    n('categoryPriority'),
    s('productId'),
    s('productName'),
    s('unit'),
    n('purchasePrice'),
    n('mrp'),
    n('sellingPrice'),
    n('discountAmount'),
    n('discountPercentage'),
    n('quantity'),
    n('discountTotal'),
    n('total'),
  ]),

  users: define('users', [s('email'), s('displayName'), s('role'), dt('lastLoginAt')]),

  settings: define('settings', [j('data', {})]),

  sequences: define('sequences', [s('prefix'), n('padding'), n('lastNumber'), s('claimToken')]),
};

export function columnKeys(schema: SheetSchema): string[] {
  return schema.columns.map((column) => column.key);
}
