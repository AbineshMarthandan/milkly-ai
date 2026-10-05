# Milkly AI

Multi-vendor billing and product management for businesses that buy from several
vendors (e.g. Aavin, Milkymist) and supply stores along delivery routes.
React 19 + TypeScript + Vite, with **Google Sheets as the database** and no backend
server. The data layer sits behind repository interfaces, so it can move to MongoDB later.

## Features

- **Masters**: vendors, categories (per vendor), products (per vendor and category),
  routes, and customers/stores (per route). Each has a priority, search, filters,
  soft delete and restore.
- **Billing**: pick a route, then a store. The catalogue is grouped
  vendor → category → product in priority order.
  - Typing a quantity moves you to the next product with Enter or ↓.
  - Discount %, subtotal, total discount and grand total update live.
  - "Repeat last bill" copies a store's previous quantities, and after a save the screen moves to the next store on the route.
- **Save / Print / Save & Print / Cancel**: printing a draft never saves it and never assigns a bill number.
- **Thermal printing**: 80 mm and 58 mm receipts sized exactly to their content (A4/A5 invoices are also available).
- **Past Bills**: date range, route, customer, vendor, status and bill-number search. Each bill can be viewed, reprinted, edited (Super Admin and above) or cancelled.
- **Dashboard**: counts, today's and this month's sales, a 14-day chart, top vendors and products.
- **Sales & profit report**: Today, 1 Week, 1 Month or a custom range. Shows each vendor → category → product with charts, and downloads as a PDF.
- **Roles**: Tech Admin, Super Admin, Admin ([matrix](docs/PERMISSIONS.md)), enforced in routes, menus, buttons and services.
- **Google Sheets Configuration** (Tech Admin): connection, *Test connection*,
  validate and repair the sheet structure, and protect the admin tabs.

## Quick start (demo, no Google account needed)

```bash
npm install
npm run dev
```

Open http://localhost:5180 and choose one of the **Try the demo** roles. Demo
data is stored only in your browser. Reset it under *Settings → Reset demo data*.

## Connecting your Google Sheet

1. **Google Cloud Console** → create or select a project → *APIs & Services* →
   enable the **Google Sheets API**.
2. **OAuth consent screen** → *Internal* (Google Workspace), or *External* with each
   user added as a test user. Scopes: `.../auth/spreadsheets`, `openid`, `email`, `profile`.
3. **Credentials → Create OAuth client ID → Web application**. Add every origin you
   serve the app from under *Authorised JavaScript origins*, e.g.
   `http://localhost:5180` and `https://billing.example.com`. You don't need a
   redirect URI, and you don't need the client secret.
4. Create a **blank Google Sheet** and share it (Editor) with every user's Google account.
5. Give the app the two **public** identifiers, in any one of these ways:
   - In the app: *Set up Google Sheets* on the sign-in page (or *Google Sheets
     Configuration* once you are a Tech Admin). This is stored for that browser only.
   - At deployment: copy `public/app-config.example.json` to `app-config.json` on the
     web server. No rebuild is needed.
   - At build time: copy `.env.example` to `.env.local` and fill in `VITE_GOOGLE_OAUTH_CLIENT_ID`
     and `VITE_GOOGLE_SPREADSHEET_ID`.
6. Sign in with Google. On an empty sheet the app creates the tabs and makes you the
   first **Tech Admin**. Then add your users under *Administration → Users*.

> **Security:** no private keys, service-account keys or client secrets are used
> or accepted anywhere. The access token stays in memory only. App roles are
> checked in the browser. Use *Protect admin tabs*, and share the spreadsheet
> carefully. See [Architecture → Limitations](docs/ARCHITECTURE.md#limitations-you-must-know-about).

## Thermal printers

Choose *Settings → Print format → Thermal receipt 80 mm / 58 mm* (80 mm is the default).
Install the printer in the operating system, then pick it in the print dialog. Each
receipt sets its own page length, so the roll feeds exactly one bill. To print with one
click at the counter, make the thermal printer the system default and start Chrome
with `--kiosk-printing`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5180 |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit and integration tests (domain logic, row mapping, full Google Sheets lifecycle against a fake Sheets API, PDF generation) |
| `npm run lint` | ESLint |

`dist/` is a static site that can be hosted anywhere (Netlify, Vercel, Firebase
Hosting, S3, Nginx). Configure SPA fallback to `index.html`, and add the site's
origin to the OAuth client.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): layers, auth and security model, concurrency, caching, limits
- [Data model & sheet schema](docs/DATA_MODEL.md)
- [Roles & permissions](docs/PERMISSIONS.md)
- [Migrating to MongoDB](docs/MONGODB_MIGRATION.md)
