# FylePro — GST Data Validation Master (code-level reference)

This is the single source of truth for **every validation rule** in the app, where
it lives in code, its severity, and which SOP checklist item it covers. Use it to
verify the logic at code level.

## Where the logic lives
| Concern | File |
|---|---|
| Rule engine (per-row + cross-row) | `server/src/services/gstr1/validate.ts` |
| Ingestion + classification + blank-row skip + doc summary | `server/src/services/gstr1/flat-format.ts` |
| GSTIN format + checksum | `server/src/services/gstin.ts` |
| State-code master, UQC, tax split, money math | `server/src/services/gstr1/util.ts`, `validate.ts` |
| Cross-FY duplicate lookup (DB) | `server/src/routes/gstr1.routes.ts` (`POST /datasets`) |
| Entry point | `validateDataset(records, ctx)` in `validate.ts` |

`ctx: ValidationContext = { supplierGstin, supplierStateCode, period (MMYYYY), existingInvoiceNumbers?, aatoOver5Cr? }`

Severity: **error** = blocks (`is_valid=false`), **warning** = advisory. Each issue carries a
GSTN-style `code` where applicable.

---

## A. Implemented automated rules

| # | Rule | Severity | Code | Function (`validate.ts` unless noted) |
|---|---|---|---|---|
| 1 | GSTIN format (15-char structure: 2 state + 10 PAN + entity + Z + checksum) | error | RET191113 | `validateByType` → `gstin.ts:isValidGstinFormat` |
| 2 | GSTIN checksum (mod-36) | error | RET191113 | `gstin.ts:isValidGstin` |
| 3 | GSTIN state-code prefix in official master | error | RET191113 | `validateByType` → `util.ts:isValidStateCode` |
| 4 | Place of Supply must be a valid state code | error | RET191134 | `validateByType` (`pos`) |
| 5 | PoS must match recipient GSTIN state | error | RET191134 | `validateRecord` (step 6) |
| 6 | Inter-state → IGST only (no CGST/SGST) | error | RET191150 | `applyTaxLogic` |
| 7 | Intra-state → CGST+SGST only (no IGST) | error | RET191150 | `applyTaxLogic` |
| 8 | IGST and CGST/SGST cannot coexist on a line | error | RET191150 | `applyTaxLogic` |
| 9 | CGST must equal SGST | error | RET191151 | `applyTaxLogic` |
| 10 | Reverse-arithmetic: tax = rate × taxable (±₹1) | error | RET191175 | `applyTaxLogic` |
| 11 | GST rate must be a valid slab (0/0.1/0.25/1/1.5/3/5/6/7.5/12/18/28) | error | RET191175 | `validateByType` (`rate`) |
| 12 | Invoice/Note number ≤16 chars, only A–Z 0–9 `-` `/` | error | RET191108 | `validateRecord` (step 2) |
| 13 | Duplicate line (same key + rate + POS) | warning | RET191102 | `crossRowChecks` |
| 14 | Duplicate invoice number across recipients (in file) | error | RET191102 | `crossRowChecks` |
| 15 | Duplicate invoice number already filed this FY (cross-upload, DB) | error | RET191102 | `crossRowChecks` + route query |
| 16 | HSN/SAC numeric, 4/6/8-digit, valid chapter (01–98 / 99 services) | error | RET191180 | `validateHsn` |
| 17 | HSN special characters → rejected (numeric only) | error | RET191180 | `validateHsn` |
| 18 | 6-digit HSN (mandatory if AATO > ₹5 Cr, else advisory) | error/warning | RET191180 | `validateHsn` |
| 19 | HSN summary: UQC must be in UQC master | warning | — | `applySectionRules` (`hsn`) |
| 20 | HSN summary: quantity required for goods | warning | — | `applySectionRules` (`hsn`) |
| 21 | Document number required | error | — | `validateRecord` (required fields) |
| 22 | Document date required + sane (≥ Jul-2017) | error | — | `validateRecord` / `checkDate` |
| 23 | Document date not in return period → verify amendment / undeclared | warning | — | `checkDate` |
| 24 | **Return Period must equal the filing period** | error | — | `validateRecord` (step 3b) |
| 25 | **No negative amounts** (taxable, IGST/CGST/SGST, cess, value, advance, nil/exempt) | error | — | `validateRecord` (step 4) |
| 26 | Credit/Debit note must reference Original Invoice Number | error | RET191115 | `applySectionRules` |
| 27 | Credit/Debit note Original Invoice Date required | warning | — | `applySectionRules` |
| 28 | **Credit/Debit note reason required** (ReasonForCreditDebitNote) | error | RET191116 | `applySectionRules` |
| 29 | CDN original invoice not found in upload → verify earlier period | warning | — | `crossRowChecks` |
| 30 | **Amendment docs (RNV/RCR/RDR/ANV/ACR/ADR) require reason + original ref** | warning | — | `validateRecord` (step 4b) |
| 31 | Round-off & cross-foot: invoice value = taxable+tax+cess (±0.99) | warning | — | `crossRowChecks` |
| 32 | Invoice value consistent across rate lines | error | — | `crossRowChecks` |
| 33 | B2CL inter-state only + value > ₹1,00,000 | error/warning | RET191150 / RET191167 | `applyTaxLogic` / `applySectionRules` |
| 34 | B2B vs B2C routing (registered GSTIN → B2B, else B2C) | classification | — | `flat-format.ts:classifyRow` |
| 35 | Partial/invalid recipient GSTIN routed to B2C → verify | warning | — | `applySectionRules` (`b2cl`/`b2cs`) |
| 36 | Export: shipping bill expected | warning | — | `applySectionRules` (`exp`) |
| 37 | Export WPAY/WOPAY ↔ rate consistency | warning | — | `applySectionRules` (`exp`) |
| 38 | Blank line items skipped on ingest | — | — | `flat-format.ts:parseFlatWorkbook` |
| 39 | Document-count summary (issued / cancelled / net by type) | info | — | `flat-format.ts` (`docSummary`) |
| 40 | Tax rate present where tax amount present and vice-versa (rate×taxable check) | error | RET191175 | `applyTaxLogic` |

---

## B. GSTR-1 SOP checklist → status

| SOP item | Status | Rule(s) |
|---|---|---|
| Remove blank line items (template / Advance / Doc Details) | ✅ Implemented | #38 |
| S.No. in proper order | ⚪ N/A — template has no S.No. column |
| OEM not blank + cross-check file name | 🟡 Manual — OEM/client mapping + filename is a workflow step |
| Return Period = e.g. 022026 | ✅ Implemented | #24 |
| Amounts not negative | ✅ Implemented | #25 |
| HSN/SAC not blank | ✅ Implemented | #16 (missing → warning) |
| Remove special characters in HSN | ✅ Implemented | #17 |
| Document No. & Date not blank | ✅ Implemented | #21, #22 |
| Date not in current month → amendment/undeclared | ✅ Implemented | #23 |
| Amendment reason + old invoice details | ✅ Implemented | #30 |
| Amendments pasted at end of main template | 🟡 Manual — spreadsheet prep |
| CR/DN linked document number + date | ✅ Implemented | #26, #27 |
| CR/DN reason in column V | ✅ Implemented | #28 |
| Amount as per TB not blank [Summary row 23] | 🟡 Manual — needs Trial Balance input |
| Capital goods / advances / amendments review | 🟡 Manual — judgement vs TB |
| Check "GSTR-1 Data from Client" for amendments | 🟡 Manual |
| Paste final TB in "GSTR 1 Trial Balances" folder (naming) | 🟡 Manual — file/folder workflow |
| Advance adjustment month confirmation with SPOC | 🟡 Manual |
| Mark tracker if opening balances in output ledgers | 🟡 Manual — tracker/TB |

## C. GSTR-3B SOP checklist → status
GSTR-3B is the **inward / purchase-register** side. The app currently ingests **outward
(GSTR-1)** data; the generic checks below already apply to any uploaded tabular GST data,
the rest need a dedicated **inward register + Trial Balance** ingestion (planned).

| SOP item | Status | Notes |
|---|---|---|
| Remove blank line items | ✅ | #38 |
| S.No. proper order / first row not blank | 🟡 Manual / N/A |
| OEM not blank + filename cross-check | 🟡 Manual |
| Return Period = e.g. 012026 | ✅ | #24 |
| Amounts not negative | ✅ | #25 |
| Doc No./Date + Purchase voucher No./Date not blank | 🟡 Planned (inward) — needs purchase-voucher fields |
| Tax rate or tax amount not filled → fill | ✅ (generic) | #10, #40 |
| Profit centre (Automotive/PPS/Others); FCM → Customer GSTIN not blank | 🟡 Planned (inward) — needs profit-centre + FCM columns |
| Change DR↔CR by voucher type; cross-verify TB | 🟡 Manual — requires Trial Balance |
| TB total ITC incl. RCM not blank | 🟡 Manual — Trial Balance |
| Capital goods / RCM / ITC-ineligible checks | 🟡 Planned (inward) — eligibility indicator column |
| Eligibility indicator + reverse charge filled | 🟡 Planned (inward) |
| Capital goods match TB, marked CG | 🟡 Manual — Trial Balance |
| Update tracker columns (Q/T/U/V/W/X/Y) | 🟡 Manual — tracker workflow |
| MMD / UMD check, comments, save to folder | 🟡 Manual — workflow |
| Paste TB in folder (naming convention) | 🟡 Manual — workflow |
| Opening balances zero / closing balances | 🟡 Manual — Trial Balance |

**Legend:** ✅ implemented & verified · 🟡 manual workflow or planned (needs Trial Balance /
inward-register ingestion) · ⚪ not applicable to the current template.

---

## D. Masters used
- **GST state codes** — `util.ts:STATE_NAMES` (official 38-code master incl. 26 merged DNH&DD, 99 Other Country).
- **GST rate slabs** — `validate.ts:VALID_RATES`.
- **UQC** — `validate.ts:UQC_MASTER` (45 codes).
- **Document types / Supply types** — `flat-format.ts:DOC_TYPES`, `SUPPLY_TYPES`.
- **HSN** — structural master (numeric, 4/6/8-digit, chapter 01–98 / 99 services).

## E. Roadmap (to fully cover the GSTR-3B SOP)
1. **GSTR-3B inward register ingestion** — a separate template with purchase-voucher no./date,
   profit centre, eligibility indicator (CG / RCM / ineligible), reverse-charge flag, ITC heads.
2. **Trial Balance import + reconciliation** — to satisfy "Amount as per TB", DR↔CR by voucher
   type, capital-goods/opening-balance checks, and the tracker columns.
3. **Tracker export** — generate the reviewer tracker (columns Q/T/U/V/W/X/Y) automatically.
