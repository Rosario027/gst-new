# FylePro — UI Prototype

> FylePro GST compliance platform · interactive UI prototype for Apex Enterprises demo

**Version**: 2.0.40
**Status**: Demo-ready HTML/CSS/JS prototype (no backend)
**Author persona**: Jude Akash, Tax Manager · Apex Enterprises (PAN AABCT3518Q)

---

## What this is

A single-page-app-style interactive prototype demonstrating FylePro next-generation GST compliance product. **Fully clickable**, **multi-entity aware**, and **covers every workflow** a tax manager would touch in a typical month — outward returns, inward reconciliation, ITC setoff, IRN/EWB generation, IMS actions, payments, notices, and reports.

Built as pure HTML + CSS + JavaScript with **no backend**. All numbers, IRNs, timestamps and statuses are realistic fixtures. Toast notifications stand in for the API calls a production version would make.

## Entities

The prototype is built for **Apex Group** with 3 GSTIN registrations under one PAN, each demonstrating a different filing pattern:

| Entity | Type | Returns | Due |
|---|---|---|---|
| `apex-steel-mh` | Normal | GSTR-1 / 3B / 9 | 11-Jun (May filing) |
| `apex-services-isd` | ISD | GSTR-6 / GSTR-6A | 13-Jun (May filing) |
| `apex-traders-comp` | Composition | CMP-08 / GSTR-4 | 18-Jul (Q1 FY26) |

Switch entities via the top-right entity badge — sidebar, modules, and dashboard all adapt.

## Modules

### Returns
- **GSTR-1** (Normal entity): 6-step guided workflow — Sales register → IRN reco → Books reco → HSN/Docs → Liability → Preview & file
- **GSTR-1A**: Same-period amendment workflow with bulk Excel upload + upload history
- **GSTR-3B**: 6-step inward + outward summary — PR validate → IMS auto-fetch → Confirm inward (IMS or 2B path) → **Tax Summary (portal-style tile view)** → ITC & set-off → Preview & file
- **GSTR-6** (ISD entity): 3-step ISD distribution flow
- **CMP-08 / GSTR-4** (Composition entity): Self-assessed quarterly + annual
- **GSTR-9 Annual**: Consolidated annual return reference

Every step page has a **clickable step-pip workflow bar** at the top so users can jump directly to any step.

### Inward & IMS
- **IMS module** (`ims.html`): Standalone Invoice Management System view with auto-categorisation summary, expandable line-wise details, bulk download / resync / response file upload, run-validate
- **Pending Action banner**: 142 IMS line items needing attention before 3B filing

### Reconciliation (internal review)
6 reconciliation pages, each with summary table + collapsible item-wise breakup:
- Purchase Register vs GSTR-2B
- GSTR-2A vs GSTR-2B
- GSTR-2A vs Books
- GSTR-2B vs Books
- Books vs IMS
- Books vs E-invoice / IMS auto-computed
- Exports tie-out (Composition entity)

These pages are for internal user review only — no bulk-post actions, just download and mark reviewed.

### IRN (E-Invoice)
- **Hub**: `einvoice.html` — Generate single / Bulk upload / Search history / Sync from IRP
- **Search & history**: `einvoice-management.html` — full-featured list with **Source column** (FylePro-generated vs Auto-fetched from IRP), period filter, doc-type filter, status filter, line-wise Excel, multi-row checkbox select with bulk actions (download, cancel, email)
- **Compliance**: CGST Rule 48(4) info card with thresholds, generation window, cancellation window, exclusions, penalty

### EWB (E-Way Bill)
- **Hub**: `ewb.html` — Generate / Bulk / Manage / Sync portal-generated
- **Manage view**: `ewb-management.html` — same Source column + period + movement-type filter + multi-row bulk select with extend/cancel/download
- **Compliance**: Rule 138 validity info card (1 day / 200 km regular, 1 day / 20 km ODC, 8-hr extend window, 24-hr cancel window, ₹50K threshold)

### Ledgers & Payments
Click "Ledgers & Payments" in the sidebar → opens overview page (`ledgers.html`) with 4 cards:
- **Cash Ledger** — current ₹84.21 L available
- **Credit (ITC) Ledger** — ₹3.42 Cr available
- **Challans (PMT-06)** — 12 pending, 2 expiring
- **DRC-03A** — Link voluntary payments to demand orders

Each child page has a breadcrumb back to the overview. Combined position banner (FylePro-black) shows: Total cash / Total ITC / Estimated 3B liability / Net additional cash required.

### Reports & Compliance
- **Reports** (`reports.html`): 12 actionable tiles, each with period dropdown + format-specific download (GSTR-1/3B/6/9/9C → PDF, GSTR-1A/IMS/FF/Ledgers/EWB → Excel, 2A/2B → Excel). Custom range opens a calendar+filing-period modal.
- **Notices & Orders** (`notices.html`): GSTN portal notices with prominent yellow Sync button + timestamp
- **Reconciliation hub**: see Reconciliation above

### Compliance & System
Amnesty applications, system settings (entity, profile, security).

## Design system

- **Brand**: FylePro black (`#4B5563`) + FylePro yellow (`#E5E7EB`)
- **Typography**: IBM Plex Sans (UI) + IBM Plex Mono (numbers, IDs, GSTINs)
- **Accent colors**: success green (`#168736`), error red (`#C8102E`), warning amber (`#C77700`), info blue (`#155CDB`), violet (`#6366F1` for IMS/portal-sync)
- **Numbering**: Indian-style lakhs/crores throughout (`₹ 1,82,891` not `182,891`)
- **Tone**: Compliance-precise — section/rule references inline (e.g., "Rule 36(4)", "Sec 17(5)(b)(i)", "CGST Rule 48(4)")

## Architecture

- **Sidebar**: Rendered by `renderShell()` in app.js, adapts per entity
- **Collapsible groups**: IRN / EWB / Ledgers / Reconciliation — each a `.nav-group-collapsible` with staggered fade-in animation, yellow gradient indicator on expanded state
- **Entity strip**: Yellow / Indigo / Green badge injected by renderShell at top of main
- **Modals**: PMT-06 challan generator, IRN cancel popup, EWB extend/cancel popups, custom date-range picker, IRN line-items viewer
- **Activity trackers**: Generic `.activity-tracker-card` pattern with clean table layout used across upload histories, IMS fetches, IRN reco history, etc.

## File organization

```
/home/claude/FylePro/
├── index.html, dashboard.html            # entry points
├── gstr1*.html, gstr3b*.html, gstr6*.html  # filing workflows
├── reco-*.html, pr-recon.html            # reconciliation pages
├── einvoice*.html                        # IRN module
├── ewb*.html                             # EWB module
├── ims.html                              # IMS standalone view
├── ledgers.html                          # ledger overview landing
├── cash-ledger.html, credit-ledger.html  # ledger detail pages
├── challans.html, drc03a.html            # payment pages
├── reports.html                          # reports tile grid
├── notices.html                          # notices & orders
├── compliance pages (amnesty, drc03a)
├── app.js                                # renderShell, modals, toggles
├── styles.css                            # design tokens + all components
└── README.txt, SESSION-STATE.md          # docs
```

## Key flows for demo

1. **Land → Dashboard** → 7-of-10-source sync widget, action-needed card for 3B, IMS pending banner
2. **GSTR-1 → Step 1** → drop Excel → Run Validate (inline) → see activity tracker history → preview
3. **GSTR-3B → Step 2** (IMS fetch) → activity tracker shows fetch history → Step 3 with IMS/2B toggle and expandable summary → **Step 4 Tax Summary** with portal-style tiles clickable to expand line-wise data → Step 5 ITC set-off → Step 6 file
4. **IMS** → expand any auto-cat row → see line-wise sample invoices
5. **Reports** → click a tile → period dropdown → format-specific download
6. **IRN/EWB Manage** → filter by period → multi-select rows → bulk action bar appears with download/cancel/extend

## What's intentionally NOT in the prototype

- Real IRP / GSTN portal connectivity (toasts simulate it)
- Actual file generation (downloads show toast)
- User authentication
- Permission system
- Real payment gateway
- Editable form persistence (uploads are illustrative)

---

*Prototype built iteratively in 40 release fragments (v2.0.0 through v2.0.40) on a HTML+CSS+JS-only stack. Session state and design decisions tracked in `SESSION-STATE.md`.*
