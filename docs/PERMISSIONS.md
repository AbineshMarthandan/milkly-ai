# Roles & permissions

Defined in `src/domain/permissions/permissions.ts`. The same matrix drives the
sidebar, route guards (`RequirePermission`), buttons (`usePermission`/`Can`) and
the application services (`assertCan`).

| Permission | Tech Admin | Super Admin | Admin |
| --- | :-: | :-: | :-: |
| `dashboard:view` | ✓ | ✓ | ✓ |
| `vendor:view`, `category:view`, `product:view`, `route:view`, `customer:view` | ✓ | ✓ | ✓ |
| `vendor:manage`, `category:manage`, `product:manage`, `route:manage`, `customer:manage` (add / edit / delete = deactivate / restore) | ✓ | ✓ | — |
| `bill:create` (save new bills, always dated today) | ✓ | ✓ | ✓ |
| `bill:print` (print drafts & saved bills) | ✓ | ✓ | ✓ |
| `bill:view` (Past Bills) | ✓ | ✓ | ✓ |
| `bill:update` (edit **today's** valid bills) | ✓ | ✓ | — |
| `bill:cancel` (mark a bill as invalid, with a reason) | ✓ | ✓ | — |
| `report:view` (sales & profit — exposes purchase prices) | ✓ | ✓ | — |
| `user:manage` | ✓ | — | — |
| `settings:app:manage` (business details, currency, print format) | ✓ | — | — |
| `settings:sheets:manage` (Google Sheets connection, diagnostics, repair, protection) | ✓ | — | — |

Notes

* "Delete" is always a soft delete. No role can physically delete records.
* Bill date rules apply to every role, Tech Admin included: bills are created
  only for today, only today's bills can be edited, and a bill from an earlier
  day can only be marked invalid (then re-billed today). See *Bill lifecycle*
  in [DATA_MODEL.md](DATA_MODEL.md).
* Users cannot deactivate themselves, and the last active Tech Admin cannot be
  demoted or deactivated.
* The first person to sign in to an **empty** spreadsheet becomes Tech Admin
  (only possible while the `users` tab has no users).
* App roles are enforced in the browser; see *Limitations* in
  [ARCHITECTURE.md](ARCHITECTURE.md) and the *Protect admin tabs* action.
