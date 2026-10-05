# Migrating from Google Sheets to MongoDB

The business layer never sees Google Sheets, so a migration means writing one
new `DataSource` and moving the data. UI, hooks and services stay unchanged.

## 1. Implement the repositories

Create `src/infrastructure/mongodb/` (calling a small API, or Atlas Data API /
App Services from the browser):

| Interface | MongoDB implementation |
| --- | --- |
| `Repository<T>` (vendors, categories, products, routes, customers) | `find({})`, `findOne({_id})`, `insertOne`, `findOneAndUpdate({_id, version: expected}, {$set, $inc: {version: 1}})` — a `null` result means `CONCURRENT_UPDATE`. `delete` = `$set: {isActive: false}`. |
| `UserRepository.findByEmail` | `findOne({ email })` with a unique index on `email`. |
| `BillRepository` | Store the embedded `Bill` document as-is (no `bill_items` split). `list` → `find({billDate: {$gte, $lte}, status: {$in}}, {projection: {vendors: 0}})`; `listLines` → `$unwind` vendors → categories → items. |
| `SequenceRepository.next(entity, floor)` | `findOneAndUpdate({_id: entity}, [{$set: {lastNumber: {$add: [{$max: ['$lastNumber', floor]}, 1]}}}], {upsert: true, returnDocument: 'after'})` — atomic. |
| `SettingsRepository` | `settings` collection, `{_id: key, data, version, …}`. |
| `DatabaseAdministration` | Index checks / creation instead of tab repair. |

Reuse `stampCreate` / `stampUpdate` from `src/infrastructure/shared/audit.ts`
so audit fields behave identically.

Recommended indexes: `users.email` (unique), `bills.billNumber` (unique),
`bills.billDate`, `bills.customerId`, `customers.routeId`,
`products.categoryId`.

## 2. Move the data

Each tab already is a collection with Mongo-compatible documents:

1. Read every tab with the existing `GoogleSheetsDataSource` (or export CSVs).
2. For each collection except `bills`/`bill_items`: insert the rows as documents
   (JSON columns are parsed by the row mapper).
3. For bills: `await sheets.bills.getById(id)` already returns the embedded
   document (lines regrouped, current revision only) — insert it directly.
4. Set each `sequences` counter to the highest number in use.
5. Spot-check totals: `services.reports.generateSalesReport(...)` should give the
   same figures on both data sources.

## 3. Switch

Construct the new data source in `src/app/store/sessionManager.ts` (and the
matching identity provider, e.g. your backend session). Nothing else changes.
