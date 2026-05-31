# Sample GSTR-1 files (reconciliation demo)

Pre-built workbooks for trying the **books vs e-invoice / IRN** reconciliation.
GSTIN `27AABCT3518Q1ZV` · period `052026`. (These are also downloadable in-app from
the Reconciliation Workbench, and via `/api/gstr1/sample/books` · `/sample/einvoice`.)

| File | Use as |
|---|---|
| `GSTR1-sample-books-052026.xlsx` | the **books** upload |
| `GSTR1-sample-einvoice-052026.xlsx` | the **comparison** (e-invoice) upload |
| `GSTR1-blank-template.xlsx` | empty template to fill from your own books |

The two sample files differ on purpose so the reconciliation surfaces every case:

| Invoice | Difference | Result |
|---|---|---|
| INV-2026-001 | identical | matched |
| INV-2026-002 | taxable ₹1,20,000 (books) vs ₹1,25,000 (e-inv) | value mismatch |
| INV-2026-003 | only in books (not on IRP) | only in books |
| INV-2026-004 | only in e-invoice (missed in books) | only in e-invoice |
| INV-2026-005 | place of supply Haryana vs Delhi | value mismatch |
| INV-2026-006 | intra-state, identical | matched |
| B2CL / CDNR / Export | identical | matched |

Expected summary: **5 matched · 2 mismatch · 1 only-in-books · 1 only-in-e-invoice**.

### How to use
1. Open **GSTR-1 → Reconciliation Workbench**, pick GSTIN + period (May 2026).
2. Upload `…-books…` as the books file.
3. Upload `…-einvoice…` as the comparison file, then **Run reconciliation**.
4. **Download reconciliation report (Excel)** for the line-by-line output.
5. **Generate JSON** to produce the portal-ready GSTR-1 file from the books data.
