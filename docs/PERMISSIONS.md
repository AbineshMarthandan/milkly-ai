# Roles & permissions

Defined in `src/domain/permissions/permissions.ts`. The same matrix drives the
sidebar, route guards (`RequirePermission`), buttons (`usePermission`/`Can`) and
the application services (`assertCan`).

| Permission | Tech Admin | Super Admin | Admin |
| --- | :-: | :-: | :-: |
| `dashboard:view` | ✓ | ✓ | ✓ |
| `vendor:view`, `category:view`, `product:view`, `route:view`, `customer:view` | ✓ | ✓ | ✓ |
| `vendor:manage`, `category:manage`, `product:manage`, `route:manage`, `customer:manage` (add / edit / delete = deactivate / restore) | ✓ | ✓ | — |
| `bill:create` (save new bills) | ✓ | ✓ | ✓ |
| `bill:print` (print drafts & saved bills) | ✓ | ✓ | ✓ |
| `bill:view` (Past Bills) | ✓ | ✓ | ✓ |
| `bill:update` (edit finalized bills) | ✓ | ✓ | — |
| `bill:cancel` (soft-delete bills) | ✓ | ✓ | — |
| `report:view` (sales & profit — exposes purchase prices) | ✓ | ✓ | — |
| `user:manage` | ✓ | — | — |
| `settings:app:manage` (business details, currency, print format) | ✓ | — | — |
| `settings:sheets:manage` (Google Sheets connection, diagnostics, repair, protection) | ✓ | — | — |

Notes

* "Delete" is always a soft delete. No role can physically delete records.
* Users cannot deactivate themselves, and the last active Tech Admin cannot be
  demoted or deactivated.
* The first person to sign in to an **empty** spreadsheet becomes Tech Admin
  (only possible while the `users` tab has no users).
* App roles are enforced in the browser; see *Limitations* in
  [ARCHITECTURE.md](ARCHITECTURE.md) and the *Protect admin tabs* action.
