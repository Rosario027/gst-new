# FylePro GST — Full-Stack Platform (GSTR-1 module)

> GST compliance platform. This repo is the **working full-stack app** built on top of the original FylePro UI prototype, focused on the **GSTR-1 module for regular taxpayers** with a **reconciliation-first** workflow.

**Stack:** Node + Express + TypeScript · PostgreSQL (row-level-security multi-tenant) · ExcelJS · the existing HTML/CSS/JS frontend served statically.

---

## What it does (GSTR-1 reconciliation pipeline)

```
 Download template  →  Fill from books  →  Upload + validate  →  Reconcile vs e-invoice/portal
        →  Generate GSTN portal JSON  →  Download .json  OR  push via GSP API
```

1. **Template** — generates a friendly **flat single-sheet** upload workbook (`GSTR1Data` + `Instructions` + `Masters`). One row per invoice line; the tool classifies each line into the right GSTR-1 table from `DocumentType` + `SupplyType` + `CustomerGSTIN`. Column names match the common enterprise "raw file" layout, so exports from other tools import directly. (Legacy per-section template still available at `/api/gstr1/template?format=sections`.)
2. **Upload + validate** — auto-detects the flat format (falls back to the multi-sheet layout / CSV). Validates GSTIN checksum, rates, POS, dates, invoice-number format, duplicates, **inter/intra tax logic** (IGST vs CGST+SGST by POS vs supplier state, CGST=SGST, no IGST+CGST/SGST on one line), and invoice value = taxable + tax + cess. HSN summary (table 12) is auto-aggregated from the lines.
3. **Reconcile** — invoice-by-invoice match of books vs a comparison source (e-invoice / portal), flagging `matched`, `value mismatch`, `only in books`, `only in compare`.
4. **Generate JSON** — builds the exact GSTR-1 portal JSON schema (CGST/SGST vs IGST split by place-of-supply, doc_issue net, HSN, etc.).
5. **Deliver** — per-registration `delivery_mode`: `json` (download file) or `api` (push via a GST Suvidha Provider — interface stubbed, ready for credentials).

The reconciliation **workbench** is at `/gstr1-workbench.html`.

**Also included**
- **Live due dates** — GSTR-1 (11th) and GSTR-3B (20th) countdowns computed from today, shown on the dashboard, sidebar and entity strip (`computeGstDueDates`).
- **GSTR-3B** (`/gstr3b.html`) — auto-prepares tables 3.1 / 3.2 and tax liability from the period's GSTR-1 data, with manual ITC entry, net-payable, and portal-JSON download.
- **Compare two files** (`/reco-files.html`) — free-form reconciliation of any two GSTR-1 data files (no GSTIN/period needed) with a downloadable Excel report.
- **Reset workflow** — wipes a period's datasets/reconciliations/filings and restarts from step 1.

---

## Project layout

```
/
├── server/src/                  # TypeScript backend
│   ├── index.ts                 # Express bootstrap, serves /public + API
│   ├── config.ts  db.ts         # env + pg pool with per-request RLS context
│   ├── middleware/              # auth (JWT), async error wrapper
│   ├── routes/                  # auth.routes.ts, gstr1.routes.ts
│   └── services/
│       ├── gstin.ts             # GSTIN format + checksum
│       ├── gstr1/               # sections, template, parser, validate, reconcile, json-builder, util
│       └── portal/              # PortalClient: stub (JSON) + gsp (API placeholder)
├── public/                      # the existing frontend prototype (served statically)
│   ├── api.js                   # shared API client + auth
│   ├── gstr1-workbench.{html,js}# the working reconciliation module
│   └── *.html, app.js, styles.css
├── db/
│   ├── schema.sql               # canonical schema (multi-tenant + RLS + GSTR-1 tables)
│   └── seed.sql                 # clean slate (no demo data; onboarding creates real tenants)
├── dist/                        # compiled output (gitignored)
├── package.json  server/tsconfig.json
├── .env.example  railway.json  Procfile
```

> `db/schema.sql` is the canonical schema. The old `fylepro_pgadmin_schema.sql` is kept for reference only.

---

## Local development

```bash
npm install
cp .env.example .env            # set DATABASE_URL + JWT_SECRET

npm run build                   # compile TS -> dist/
npm run db:setup                # apply schema.sql + seed.sql
npm start                       # http://localhost:8080

# or hot-reload:
npm run dev
```

**First run:** open the app → **New user?** → temporary credentials **new / new123**
→ add your real GSTIN(s) → create your admin login → finish. This creates the
tenant, company, GST registration(s) and admin user in the database. There is
no pre-seeded demo account.

---

## Deploy on Railway

1. Create a Railway project, add the **PostgreSQL** plugin.
2. On the **app service**, add a reference variable to the Postgres service:
   `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
   If your Railway template exposes private variables instead, use
   `DATABASE_URL=${{Postgres.DATABASE_URL_PRIVATE}}` or
   `DATABASE_PRIVATE_URL=${{Postgres.DATABASE_PRIVATE_URL}}`.
   Seeing healthy variables on the Postgres service is not enough; the app
   service must receive one of these values too.
3. Add app service variables: `JWT_SECRET`, `PGSSL=true`, `NODE_ENV=production`.
   (Optional GSP API: `GSP_PROVIDER`, `GSP_BASE_URL`, `GSP_CLIENT_ID`, `GSP_CLIENT_SECRET`.)
4. Deploy this repo. Build/start are defined in `railway.json` (`npm run build` → `npm start`).
5. One-time DB init: run `npm run db:setup` from the Railway shell (or locally pointed at the Railway `DATABASE_URL`).
6. Health check: `GET /api/health`.

---

## API (all under `/api`, JWT via `Authorization: Bearer` or `fp_token` cookie)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | login → JWT |
| GET  | `/auth/registrations` | GSTINs the user can access |
| GET  | `/gstr1/sections` | section metadata (drives the UI) |
| GET  | `/gstr1/template?gstin=&period=` | download upload workbook |
| POST | `/gstr1/datasets` | upload file → parse + validate + store |
| GET  | `/gstr1/datasets/:id` | dataset + records + errors |
| POST | `/gstr1/reconcile` | reconcile two datasets |
| POST | `/gstr1/generate` | build + store GSTR-1 JSON |
| GET  | `/gstr1/filings/:id/json` | download the portal JSON |
| POST | `/gstr1/filings/:id/push` | deliver (JSON stub or GSP API) |

---

## Multi-tenancy & security

Every tenant-scoped query runs inside `withTenant()`, which sets `app.current_tenant_id` /
`app.current_user_id` as transaction-local config; PostgreSQL **row-level security** policies
enforce isolation at the database level. Passwords are bcrypt (pgcrypto-compatible).

## Next integration points (you'll wire these)

- **GSP push** — fill in `server/src/services/portal/gsp.ts` (auth token, AES/RSA payload encryption, `RETSAVE`). The rest of the app already routes through the `PortalClient` interface.
- **E-invoice / 2A/2B fetch** — feed the comparison dataset (`source: 'einvoice' | 'portal'`) for richer reconciliation.
- **Other returns** (GSTR-3B etc.) — the prototype pages exist; extend the same dataset/JSON pattern.
