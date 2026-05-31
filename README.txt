═══════════════════════════════════════════════════════════════════════════
  DigiGST 2.0 — EY GST Compliance Platform · Interactive Prototype
  Version 2.0.9 · Build 2026.05 · 15-May-2026
═══════════════════════════════════════════════════════════════════════════

  Pure HTML / CSS / JS — no backend, no build step. Open index.html in
  any modern browser. All data is hand-crafted to be plausible for a
  Tata-scale enterprise on the EY DigiGST platform.


───────────────────────────────────────────────────────────────────────────
  WHAT'S NEW IN v2.0.9 — STEP PAYLOAD CONTROL
───────────────────────────────────────────────────────────────────────────

  Under every workflow step (12 step pages across GSTR-1, GSTR-3B Inward
  and GSTR-6 ISD), users now get a uniform "data control panel" that
  exposes:

  • Final-payload files ready for the next stage — downloadable as
    JSON, Excel, CSV, PDF, ZIP. Examples:
        sales-register-v4.json      (12.8 MB, GSTN-spec)
        sales-register-v4.xlsx      (18.4 MB, all sheets)
        validation-report-v4.pdf    (742 warnings, 23 errors resolved)
        step1-full-bundle-v4.zip    (all artefacts)

  • Six action buttons:
        Add records      append new rows to the payload
        Edit rows        modify existing rows in place
        Amend prior      bring in prior-period amendments
        Manual override  force-override values (logged with reason)
        Reset step       discard uncommitted edits, revert to clean
        Re-sync          re-pull from GSTN / ERP / GSP source
                         (only on steps with an external data source)

  • Audit-grade version history. Every snapshot is retained:
        v4  current   Aditya · 14-May 18:08, "Approved for IRN match"
        v3  override  Priya · 14-May 16:24, "Adjusted tax arithmetic"
        v2  resync    Priya · 13-May 11:18
        v1  initial   Priya · 12-May 09:42

    Each row has a Download button (pull that exact snapshot back) and
    a Restore button (make it the new live version). Never lose work —
    even if the latest upload went wrong, the previous good version is
    one click away.

  • Re-sync flow: button labelled with the actual source ("Re-sync from
    SAP ERP", "Re-sync from GSTN IRN portal", "Re-sync GSTR-6A from
    GSTN"). Re-sync creates a new version snapshot before overwriting
    current.


───────────────────────────────────────────────────────────────────────────
  WHAT'S NEW IN v2.0.8 — MULTI-ENTITY SUPPORT
───────────────────────────────────────────────────────────────────────────

  The prototype supports three real GST entity types under one PAN
  (AABCT3518Q), each with its own GSTIN, returns, due dates, workflow.

  ENTITY 1 · Tata Steel Maharashtra (Normal Registration)
      GSTIN 27AABCT3518Q1ZV · Monthly filer · AATO ₹ 1,28,500 Cr
      Returns: GSTR-1 → GSTR-1A → GSTR-3B → GSTR-9
      Next due: GSTR-1 by 11-Jun-2026

  ENTITY 2 · Tata Services Ltd ISD (Input Service Distributor)
      GSTIN 27AABCT3518Q2ZW · Monthly filer · distributes credit
      Returns: GSTR-6 (monthly) → GSTR-6A (auto-drafted view) → GSTR-9
      Mandatory ISD registration from 01-Apr-2025 per Notification
      16/2024-CT (amendment to §2(61) and §20 of CGST Act).
      Next due: GSTR-6 by 13-Jun-2026

  ENTITY 3 · Tata Traders LLP (Composition Scheme §10)
      GSTIN 27AABCT3518Q3ZX · Quarterly filer · AATO ₹ 1.24 Cr
      Trader at 1% (0.5% CGST + 0.5% SGST). Cannot claim ITC, cannot
      issue tax invoice (only Bill of Supply), cannot supply inter-
      state.
      Returns: CMP-08 quarterly → GSTR-4 annual by 30-Jun of next FY
      Next due: CMP-08 Q1 by 18-Jul-2026 · GSTR-4 by 30-Jun-2027

  ENTITY SWITCHER — visible at the top of every screen as a dark sticky
  strip showing current entity name, GSTIN, type-badge, next-due.
  Click to open a centered modal listing all 3 entities; selecting one
  persists in localStorage ("digigst.entity"), redirects to dashboard,
  and:

      → sidebar changes to entity-specific items
            Normal: GSTR-1/1A/3B/9, IMS, PR-recon, ITC, RCM, E-invoice
            ISD:    GSTR-6, GSTR-6A, ITC Distribution, Recipient Units
            Comp.:  CMP-08, GSTR-4, Bill of Supply, Purchase Register
      → dashboard adapts (3 distinct hero banners + KPIs + quick links)
      → due dates throughout reflect that entity's filing period


───────────────────────────────────────────────────────────────────────────
  WHAT'S NEW IN v2.0.7 — GSTR-3B INWARD WORKFLOW
───────────────────────────────────────────────────────────────────────────

  • GSTR-1 Step 4 HSN tables: CGST + SGST split into separate columns,
    Cess column added, visible cell grid lines via .data-table.grid-lined.

  • GSTR-3B renamed to "GSTR-3B Inward" across sidebar, breadcrumbs and
    page titles (outward side comes locked from GSTR-1).

  • New 5-step inward-prep workflow on gstr3b.html:
       Step 1 Validate Purchase Data        (gstr3b-step1.html)
       Step 2 Auto IMS Fetch                (gstr3b-step2.html, 6 sections)
       Step 3 Confirm Inward Summary        (gstr3b-step3.html, the big one)
       Step 4 Compute ITC & Set-off
       Step 5 Preview & File

  • Step 3 has SIX sub-tables:
       1. Matched (PR ↔ IMS)              — bulk Accept/Reject/Pending
       2. Non-matched IMS                  — same 3-action set
       3. Matched from prior pending       — auto-promoted catch-ups
       4. Pending IMS (timeline filter)    — current/3m/6m/FYTD/all
       5. Rejected IMS (timeline filter)   — same filter chips
       6. Final reconciled view (IMS vs PR) — what flows into GSTR-2B


───────────────────────────────────────────────────────────────────────────
  FILE INVENTORY
───────────────────────────────────────────────────────────────────────────

  Core shell:
      index.html, dashboard.html

  GSTR-1 Outward (normal):
      gstr1.html, gstr1-step1..6.html, gstr1a.html, gstr9-annual.html

  GSTR-3B Inward (normal):
      gstr3b.html, gstr3b-step1.html, gstr3b-step2.html, gstr3b-step3.html

  Inward-supply deep dives (normal):
      ims.html, pr-recon.html, itc-upload.html, itc-purchase-summary.html,
      itc-document-view.html, rcm-statement.html

  E-Invoice & EWB (normal):
      einvoice-upload.html, einvoice-management.html, einvoice-reports.html

  ISD entity (v2.0.8 new):
      gstr6.html, gstr6-step1.html, gstr6-step2.html, gstr6-step3.html,
      gstr6a-view.html, isd-units.html

  Composition entity (v2.0.8 new):
      cmp08.html, gstr4.html, bos-register.html, purchase-register-comp.html

  Ledgers, Compliance, Misc:
      cash-ledger.html, credit-ledger.html, challans.html, notices.html,
      drc03a.html, amnesty.html

  Shared: styles.css, app.js


───────────────────────────────────────────────────────────────────────────
  HOW TO RUN
───────────────────────────────────────────────────────────────────────────

  1. Unzip DigiGST-2.0-Prototype.zip
  2. Open index.html (or dashboard.html) in Chrome / Edge / Firefox / Safari
  3. Click the hamburger (top-left) to open the navigation drawer
  4. Click the entity strip at the top of any page to switch entities

  All buttons fire visual toasts; no actual API calls. File downloads in
  the payload-control panel are visual only (no real file emitted).


───────────────────────────────────────────────────────────────────────────
  REFERENCES (for the tax-legal accuracy of the prototype)
───────────────────────────────────────────────────────────────────────────

  • ISD mandatory registration: Notification 16/2024-CT, effective
    01-Apr-2025; amends §2(61) and §20 of CGST Act 2017.
  • GSTR-6 due 13th of following month: §39(2) CGST Act.
  • ISD distribution rules: Rule 39 of CGST Rules 2017.
  • Composition scheme: §10 of CGST Act; CMP-08 quarterly by 18th of next
    month after quarter; GSTR-4 annual by 30-Jun of next FY per Rule 62.
  • IMS (Invoice Management System): GSTN advisory, October 2024 launch.
  • HSN Phase-3 (6-digit B2C mandatory for AATO > ₹ 5 Cr): from Feb 2025.
  • E-invoice threshold ₹ 5 Cr AATO: Notification 10/2023-CT.


  ═════════════════════════════════════════════════════════════════════
  EY DigiGST Platform · v2.0.9 · For demo to Tata Enterprises tax team
  ═════════════════════════════════════════════════════════════════════
