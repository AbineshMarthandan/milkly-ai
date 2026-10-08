# Data model & Google Sheets schema

The model is a MongoDB-style document model. Each collection is one tab; row 1
holds the field names (exactly the document keys); each following row is one
document. Columns are matched **by name**, so re-ordering columns by hand is
harmless. Nested values (snapshots, arrays) are stored as JSON in one cell.

Values are written with `valueInputOption=RAW`: text such as `0098…` or
`=SUM()` is stored verbatim (no number coercion, no formula injection).

## Common fields (every collection)

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | string | Business ID such as `MLVID000001`. Never a row number. Never reused. |
| `isActive` | boolean | Soft-delete flag. Blank cells read as `true`. |
| `version` | number | Optimistic-concurrency token, +1 on every write. |
| `createdAt` / `updatedAt` | ISO-8601 UTC | Set by the persistence layer. |
| `createdBy` / `updatedBy` | user `_id` | Set by the persistence layer. |

## IDs

| Entity | Format | Example |
| --- | --- | --- |
| Vendor | `MLVID` + 6 digits | `MLVID000001` |
| Category | `MLCAT` + 6 | `MLCAT000001` |
| Product | `MLPID` + 6 | `MLPID000001` |
| Route | `MLRID` + 6 | `MLRID000001` |
| Customer | `MLCID` + 6 | `MLCID000001` |
| User | `MLUID` + 6 | `MLUID000001` |
| Bill `_id` / bill number | `MLBID` + 6 / `MLB` + 6 (same counter) | `MLBID000123` / `MLB000123` |

Counters live in `sequences`. IDs are allocated by the services, not the UI.

## Tabs (collections)

Columns in order (the system columns `isActive, version, createdAt, createdBy, updatedAt, updatedBy` follow each list):

| Tab | Columns |
| --- | --- |
| `vendors` | `_id, vendorId, vendorName, priority` |
| `categories` | `_id, vendorId, categoryName, priority` |
| `products` | `_id, vendorId, categoryId, productName, unit, purchasePrice, mrp, sellingPrice, priority` |
| `routes` | `_id, routeCode, routeName, priority` |
| `customers` | `_id, customerId, routeId, storeName, contactPerson, phone, address, priority, vendorIds (JSON)` |
| `bills` | `_id, billNumber, billDate, status, routeId, customerId, routeSnapshot (JSON), customerSnapshot (JSON), vendorIds (JSON), vendorSummary (JSON), itemCount, totalQuantity, mrpTotal, totalDiscount, subtotal, grandTotal, notes, itemsRevision, _itemsRange, finalizedAt, finalizedBy, finalizedByName, createdByName, cancelledAt, cancelledBy, cancelReason` |
| `bill_items` | `_id, billId, billNumber, billDate, itemsRevision, lineNo, vendorId, vendorName, vendorPriority, categoryId, categoryName, categoryPriority, productId, productName, unit, purchasePrice, mrp, sellingPrice, discountAmount, discountPercentage, quantity, discountTotal, total` |
| `users` | `_id, email, displayName, role, lastLoginAt` |
| `settings` | `_id, data (JSON)` — documents `app`, `database`, `diagnostics` |
| `sequences` | `_id (entity), prefix, padding, lastNumber, claimToken` |

`vendorId` on vendors and `customerId` on customers equal `_id` (kept as explicit
business keys). `_itemsRange` is storage-only (not part of the domain model).

## Bills and bill items

The domain `Bill` is an embedded document:

```json
{
  "_id": "MLBID000001",
  "billNumber": "MLB000001",
  "billDate": "2026-10-05",
  "status": "finalized",
  "routeId": "MLRID000001",
  "customerId": "MLCID000001",
  "routeSnapshot": { "routeId": "MLRID000001", "routeName": "Route A", "routeCode": "R-A" },
  "customerSnapshot": { "customerId": "MLCID000001", "storeName": "Store A", "contactPerson": "", "phone": "", "address": "", "routeId": "MLRID000001" },
  "vendors": [
    {
      "vendorId": "MLVID000001", "vendorName": "Aavin", "priority": 1, "total": 195,
      "categories": [
        {
          "categoryId": "MLCAT000001", "categoryName": "Milk", "priority": 1, "total": 195,
          "items": [
            { "productId": "MLPID000001", "productName": "Milk", "unit": "1 L", "purchasePrice": 38, "mrp": 40,
              "sellingPrice": 39, "discountAmount": 1, "discountPercentage": 2.5, "quantity": 5, "discountTotal": 5, "total": 195 }
          ]
        }
      ]
    }
  ],
  "vendorIds": ["MLVID000001"],
  "vendorSummary": [{ "vendorId": "MLVID000001", "vendorName": "Aavin", "itemCount": 1, "total": 195 }],
  "itemCount": 1, "totalQuantity": 5, "mrpTotal": 200, "totalDiscount": 5, "subtotal": 195, "grandTotal": 195,
  "itemsRevision": "9f2c41ab07de",
  "finalizedAt": "2026-10-05T10:00:00.000Z", "finalizedBy": "MLUID000002", "finalizedByName": "Karthik",
  "createdAt": "2026-10-05T10:00:00.000Z", "createdBy": "MLUID000002", "createdByName": "Karthik",
  "isActive": true, "version": 1
}
```

On Google Sheets the header goes to `bills` and each item becomes one
`bill_items` row (with vendor/category snapshot columns). Rows whose
`itemsRevision` differs from the header's are superseded edits and are ignored.

### Calculations (domain, `src/domain/services/billing/calculations.ts`)

```
discountAmount     = MRP − sellingPrice                     (per unit)
discountPercentage = ((MRP − sellingPrice) / MRP) × 100     (2 dp; 0 when MRP = 0)
total              = sellingPrice × quantity
mrpTotal           = Σ MRP × quantity
totalDiscount      = Σ discountAmount × quantity
subtotal           = Σ total
grandTotal         = subtotal
profit (reports)   = Σ total − Σ purchasePrice × quantity
```

Money is rounded to 2 dp and summed in minor units (no floating-point drift).

### Snapshots and history

Rule: changing or deleting master data never alters a saved bill, and new
bills always use the master data as it is now.

* **Saved bills are self-contained.** Product name, unit, prices (incl. purchase
  price), vendor and category names and order, and the store's and route's
  details are copied into the bill when it is saved. Viewing, printing, Past
  Bills, the dashboard and reports read only these copies, so renaming,
  re-pricing or deleting a product, category, vendor, store or route leaves them
  exactly as they were.
* **New bills use current data.** The billing screen lists only active products
  whose vendor and category are active, at current prices and names. Before a
  bill is saved (or a draft printed), the service re-checks every line against
  the current product master. If something changed since the screen was opened
  (deleted, re-priced, renamed or moved by someone else), it refuses with
  `STALE_DATA`, refreshes the screen, and asks the user to review.
* **Drafts** that still hold quantities for an item that is no longer available
  show a warning banner, and those items are never billed.
* **Editing a saved bill** keeps its existing lines exactly as saved (names,
  order, prices), and keeps the store/route details unless the bill is moved to
  another store. Lines added during the edit use current data and are checked
  like a new bill.
* **Past Bills filters** still list deleted vendors, routes and stores (marked
  "deleted") so their history stays searchable.

`src/infrastructure/google-sheets/history.test.ts` verifies all of the above
against the Google Sheets implementation.

## Ordering

| Where | Order |
| --- | --- |
| Vendors on a bill | vendor `priority` |
| Categories within a vendor | category `priority` |
| Products within a category | product `priority` |
| Customers within a route | customer `priority` |

Ties fall back to the name, so the order is always deterministic.
