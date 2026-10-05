# Architecture

Milkly AI is a browser-only React + TypeScript application. There is **no
application server**: data lives in a Google Sheet that the browser reads and
writes through the Google Sheets REST API, using each user's own Google sign-in.

Google Sheets is treated as a *temporary persistence engine*. Everything above
the repository interfaces is written as if it were talking to MongoDB.

```
React pages & components        src/features/*, src/components/*
        │  (hooks: React Query + Zustand)
        ▼
Application services            src/domain/services/*      ← business rules, permissions, validation
        │
        ▼
Repository interfaces           src/domain/repositories    ← the persistence boundary
        │
        ├── GoogleSheetsDataSource   src/infrastructure/google-sheets   (production)
        ├── BrowserDemoDataSource    src/infrastructure/browser-demo    (demo / tests)
        └── MongoDataSource          (future — same interfaces)
```

No component imports anything from `src/infrastructure/google-sheets`. The
only place a data source is constructed is `src/app/store/sessionManager.ts`.

## Folder map

| Path | Responsibility |
| --- | --- |
| `src/domain/models` | Strongly typed documents: `Vendor`, `Category`, `Product`, `Route`, `Customer`, `Bill`, `BillItem`, `BillLine`, `User`, `AppSettings`, `GoogleSheetConfig`, `Sequence`. |
| `src/domain/repositories` | `Repository<T>`, `BillRepository`, `UserRepository`, `SettingsRepository`, `SequenceRepository`, `DataSource`, `DatabaseAdministration`. |
| `src/domain/services` | Application services (`VendorService`, …, `BillService`, `ReportService`, `DashboardService`, `UserService`, `SettingsService`, `BootstrapService`) and pure business logic (`billing/`, `reports/`, `ids`, `money`, `ordering`, `dates`). |
| `src/domain/permissions` | Permission catalogue and the role → permission matrix. |
| `src/domain/validation` | Zod schemas shared by forms and services. |
| `src/domain/errors` | `AppError` with stable codes and user-safe messages. |
| `src/infrastructure/google-sheets` | REST client, request batching, row mapper, generic `SheetCollection`, repositories, diagnostics. |
| `src/infrastructure/google` | Google Identity Services sign-in (OAuth token model). |
| `src/infrastructure/browser-demo` | localStorage implementation of every repository + seed data. |
| `src/infrastructure/config` | Resolution of the (public) connection identifiers. |
| `src/app` | Router, guards, layout, session store/manager, React Query client. |
| `src/components` | Reusable UI kit: buttons, form controls, combobox, data table, modals/drawers, charts, invoice & thermal receipt. |
| `src/features` | One folder per screen: auth, dashboard, vendors, categories, products, routes, customers, billing, pastBills, reports, users, settings. |

## Authentication & the security model

* **Sign-in**: Google Identity Services *token model* (`google.accounts.oauth2.initTokenClient`).
  The browser receives a short-lived (~1 h) access token for the
  `spreadsheets` scope plus `openid email profile`. No client secret exists.
* **Token storage**: memory only (inside `GoogleIdentityProvider`). Never in
  localStorage, sessionStorage, Zustand or React Query. A page reload requires
  one click on "Sign in with Google".
* **Expiry**: an expired token surfaces as `AUTH_EXPIRED`; a modal asks the user
  to continue (a user gesture is required to reopen Google's popup). Unsaved
  bill drafts are kept.
* **Identity → role**: the verified Google e-mail is looked up in the `users`
  collection. Unknown or deactivated users are refused.
* **What is configured, and where**: only *public identifiers* — the OAuth
  Client ID and the spreadsheet ID. Resolution order: device override (set by a
  Tech Admin in *Google Sheets Configuration*) → `/app-config.json` on the
  web server → `VITE_*` build variables. There is deliberately no field for a
  private key.

### Limitations you must know about

1. **Role checks run in the browser.** Services re-check every permission
   (`assertCan`), so the UI is not the only gate, but a user who has *Editor*
   access to the spreadsheet could still edit it directly in Google Sheets.
   Mitigations shipped:
   * *Protect admin tabs* (Google Sheets Configuration) applies Google-enforced
     protected ranges so only Tech Admins can edit `users` and `settings`.
   * Header rows are protected with a warning.
   * The ultimate control is Google Drive sharing: only share the sheet with
     people who should use the app.
2. **Service accounts cannot be used from a browser.** A service-account key is
   a server-side secret. If you need one (e.g. users without Google accounts),
   add a small backend or Google Apps Script web app and implement a new
   `DataSource` (or a new `AccessTokenSource`) — no business code changes.
3. **The `spreadsheets` OAuth scope is "sensitive".** For a Google Workspace
   organisation use an *Internal* consent screen. Otherwise keep the app in
   *Testing* with named test users, or complete Google's verification.

## Concurrency (Google Sheets is not transactional)

| Concern | What the app does | Residual risk |
| --- | --- | --- |
| ID / bill-number allocation | `sequences` counter: claim with a random token → wait → verify; retry with backoff. Counters self-heal to `max(existing IDs)`. Bill save re-allocates on a duplicate `_id`. | Two devices saving in the same ~0.5 s window can, very rarely, still collide; the duplicate check on insert catches most of these. |
| Lost updates | Every document has `version`. Writes re-read the row and reject with `CONCURRENT_UPDATE` if it changed. | Read-then-write is not atomic (sub-second window). |
| Row addressing | Rows are located by `_id` (fresh read of the `_id` column) before every write. Row numbers are never stored as identity. | — |
| Partial bill writes | Lines are appended first, the header last ("commit record"). Edits append a new line revision and switch `itemsRevision`. | Failed saves can leave orphan line rows; they are never read. |
| Hard deletes | None. Everything is soft-deleted (`isActive: false`); bills are cancelled. | — |

For strict guarantees implement `SequenceRepository` with MongoDB
`findOneAndUpdate({$inc})` or an Apps Script `LockService` endpoint.

## Performance & API quota

Sheets allows roughly 60 read and 60 write requests per minute per user.

* **Request batching** — reads issued in the same tick are merged into one
  `values:batchGet` (`BatchReader`). The billing screen's five collections cost one call.
* **Two cache layers** — React Query (5 min for master data, 1 min for bills,
  no refetch on focus) and a short in-memory collection cache that writes update in place.
* **Projection reads for bills** — Past Bills, the dashboard and reports read only
  the `_id` + `billDate` columns, then fetch just the rows in the date range.
* **Line-item pointers** — each bill header stores the A1 range its lines were
  appended to (`_itemsRange`), so opening a bill is one small read, with a
  `billId`-column scan as fallback.
* **Lazy code** — every route is code-split; jsPDF loads only on "Download PDF".
* **Retries** — 429/5xx are retried with exponential backoff, except non-idempotent
  appends on 5xx (to avoid duplicate rows).

**Capacity:** a spreadsheet holds at most 10 million cells. At ~30 columns per bill
line, plan to archive (start a new spreadsheet per financial year) or migrate to
MongoDB well before ~250,000 bill lines.

## Error handling

Every failure becomes an `AppError` with a stable code (`AUTH_EXPIRED`,
`SHEETS_PERMISSION_DENIED`, `NETWORK_ERROR`, `RATE_LIMITED`, `SPREADSHEET_NOT_FOUND`,
`SHEET_MISSING`, `SCHEMA_MISMATCH`, `DUPLICATE`, `CONCURRENT_UPDATE`,
`WRITE_FAILED`, …) and a message that is safe to show anyone. Raw Google API
details are shown only to Tech Admins. *Test connection* checks
authentication, spreadsheet access, required tabs, columns, read and write.

## Billing flow

```
Route → Customer → catalogue (vendor → category → product, by priority)
      → quantities → live totals (domain functions)
      → Save            : BillService.finalize → next MLB number → bills + bill_items
      → Print           : prints a DRAFT (no number, not saved, not in Past Bills)
      → Save & Print    : finalize, then print the saved bill
      → Cancel          : clears the local draft
```

Drafts live only on the device (Zustand, persisted per user). Printing never
saves. Only finalized and cancelled bills are ever stored or listed.
