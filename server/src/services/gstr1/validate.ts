import { SectionDef, ColumnDef, SECTION_MAP } from './sections';
import { ValidationError, ValidationContext, ValidationSummary, ParsedRecord } from '../../types';
import { isValidGstin, isValidGstinFormat, stateCodeFromGstin } from '../gstin';
import { posCode, toNumber, round2, parsePeriod, STATE_NAMES, isValidStateCode } from './util';

// Combined GST rate slabs valid in the rate-wise sheets (CGST+SGST or IGST).
const VALID_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];

// Valid Unit Quantity Codes (GSTN UQC master).
const UQC_MASTER = new Set([
  'BAG','BAL','BDL','BKL','BOU','BOX','BTL','BUN','CAN','CBM','CCM','CMS','CTN','DOZ','DRM','GGK',
  'GMS','GRS','GYD','KGS','KLR','KME','LTR','MTR','MLT','MTS','NOS','OTH','PAC','PCS','PRS','QTL',
  'ROL','SET','SQF','SQM','SQY','TBS','TGM','THD','TON','TUB','UGS','UNT','YDS',
]);
const INVOICE_NO_RE = /^[A-Za-z0-9\/-]{1,16}$/;
const AMOUNT_TOL = 2;       // ₹ rounding tolerance on tax amounts
const GST_EPOCH = 201707;   // GST rollout: Jul-2017

function err(field: string, message: string, code?: string): ValidationError {
  return { field, message, severity: 'error', code };
}
function warn(field: string, message: string, code?: string): ValidationError {
  return { field, message, severity: 'warning', code };
}

// ════════════════════════════════════════════════════════════════════
// Per-row validation (with supplier context for inter/intra tax rules)
// ════════════════════════════════════════════════════════════════════
export function validateRecord(section: SectionDef, data: Record<string, any>, ctx?: ValidationContext): ValidationError[] {
  const e: ValidationError[] = [];

  // 1. Field presence + type checks
  for (const col of section.columns) {
    const value = data[col.key];
    const present = value !== null && value !== undefined && String(value).trim() !== '';
    if (col.required && !present) {
      e.push(err(col.key, `${col.header} is required`));
      continue;
    }
    if (!present) continue;
    validateByType(col, value, e);
  }

  // 2. Invoice / note number format (≤16 chars, alphanumerics + - and /)
  for (const k of ['invoiceNumber', 'noteNumber']) {
    const v = String(data[k] ?? '').trim();
    if (v && !INVOICE_NO_RE.test(v)) {
      e.push(err(k, `"${v}" is invalid — max 16 chars, only letters, digits, "-" and "/"`, 'RET191108'));
    }
  }

  // 3. Date sanity (within/after GST epoch, not far future, period match)
  for (const k of ['invoiceDate', 'noteDate', 'shippingBillDate']) {
    if (!data[k]) continue;
    checkDate(k, data[k], ctx, e);
  }

  // 4. Amount sanity
  if (section.hasTax) {
    if (toNumber(data.taxableValue) < 0) e.push(err('taxableValue', 'Taxable value cannot be negative'));
    if (toNumber(data.cessAmount) < 0) e.push(err('cessAmount', 'Cess cannot be negative'));
  }

  // 5. HSN / SAC master validation (structure + chapter + AATO granularity)
  if (data.hsn !== undefined && data.hsn !== null && String(data.hsn).trim() !== '') {
    validateHsn(String(data.hsn).trim(), ctx, e);
  } else if (section.hasTax && (section.key === 'b2b' || section.key === 'b2cl' || section.key === 'cdnr' || section.key === 'exp')) {
    e.push(warn('hsn', 'HSN/SAC code missing'));
  }

  // 6. Place-of-supply consistency: recipient GSTIN state must match PoS.
  if ((section.key === 'b2b' || section.key === 'cdnr') && data.ctin && isValidGstinFormat(String(data.ctin))) {
    const recipientState = stateCodeFromGstin(String(data.ctin));
    const pos = posCode(data.pos);
    if (recipientState && pos && recipientState !== pos) {
      e.push(err('pos', `Place of Supply (${pos}) does not match recipient GSTIN state (${recipientState}-${STATE_NAMES[recipientState] || ''})`, 'RET191134'));
    }
  }

  // 7. Inter / intra-state tax logic (needs supplier context)
  if (ctx) applyTaxLogic(section, data, ctx, e);

  // 8. Section-specific rules
  applySectionRules(section, data, ctx, e);

  return e;
}

// HSN/SAC master validation. Goods chapters 01–98, services SAC starts 99.
// AATO ≤ ₹5Cr → min 4 digits; AATO > ₹5Cr → min 6 digits (advisory when AATO unknown).
function validateHsn(hsn: string, ctx: ValidationContext | undefined, e: ValidationError[]): void {
  if (!/^\d+$/.test(hsn)) { e.push(err('hsn', `HSN/SAC "${hsn}" must be numeric`, 'RET191180')); return; }
  if (![4, 6, 8].includes(hsn.length)) {
    e.push(err('hsn', `HSN/SAC "${hsn}" must be 4, 6 or 8 digits`, 'RET191180')); return;
  }
  const chapter = parseInt(hsn.slice(0, 2), 10);
  const isService = hsn.startsWith('99');
  if (!isService && (chapter < 1 || chapter > 98)) {
    e.push(err('hsn', `HSN "${hsn}" has an invalid chapter (${hsn.slice(0, 2)}); not in the HSN master`, 'RET191180'));
    return;
  }
  // Granularity: 6-digit recommended (mandatory for AATO > ₹5 Cr).
  const aatoOver5Cr = ctx && (ctx as any).aatoOver5Cr === true;
  if (hsn.length < 6) {
    if (aatoOver5Cr) e.push(err('hsn', `6-digit HSN required (AATO > ₹5 Cr); "${hsn}" is ${hsn.length}-digit`, 'RET191180'));
    else e.push(warn('hsn', `Use 6-digit HSN — "${hsn}" is ${hsn.length}-digit (mandatory if AATO > ₹5 Cr)`));
  }
}

function validateByType(col: ColumnDef, value: any, e: ValidationError[]): void {
  const v = String(value).trim();
  switch (col.type) {
    case 'gstin':
      if (!isValidGstinFormat(v)) e.push(err(col.key, `Invalid GSTIN format: ${v}`, 'RET191113'));
      else if (!isValidStateCode(v.slice(0, 2))) e.push(err(col.key, `Invalid GST state code "${v.slice(0, 2)}" in GSTIN ${v}`, 'RET191113'));
      else if (!isValidGstin(v)) e.push(err(col.key, `Invalid GSTIN checksum: ${v}`, 'RET191113'));
      break;
    case 'number':
      if (!Number.isFinite(toNumber(v))) e.push(err(col.key, `${col.header} must be a number`));
      break;
    case 'rate':
      if (!VALID_RATES.includes(toNumber(v))) e.push(err(col.key, `Invalid GST rate: ${v}% (allowed: ${VALID_RATES.join(', ')})`, 'RET191175'));
      break;
    case 'pos': {
      const pc = posCode(v);
      if (!pc || !isValidStateCode(pc)) e.push(err(col.key, `Invalid Place of Supply state code: ${v}`, 'RET191134'));
      break;
    }
    case 'date':
      if (!/\d/.test(v)) e.push(err(col.key, `Invalid date: ${v}`));
      break;
    case 'enum':
      if (col.enumValues && !col.enumValues.includes(v)) {
        e.push(warn(col.key, `${col.header} should be one of: ${col.enumValues.join(', ')}`));
      }
      break;
  }
}

function checkDate(field: string, raw: any, ctx: ValidationContext | undefined, e: ValidationError[]): void {
  const m = String(raw).match(/(\d{1,2})[-/ ]([A-Za-z]{3,}|\d{1,2})[-/ ](\d{4})/);
  if (!m) return; // format already flagged by type check
  const year = +m[3];
  const monStr = m[2];
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const mon = /^\d+$/.test(monStr) ? +monStr : months.indexOf(monStr.slice(0, 3).toLowerCase()) + 1;
  if (!mon || mon < 1 || mon > 12) return;
  const ym = year * 100 + mon;
  if (ym < GST_EPOCH) e.push(err(field, `Date ${raw} is before GST rollout (Jul-2017)`));
  if (ctx && field === 'invoiceDate') {
    const p = parsePeriod(ctx.period);
    const periodYm = p.year * 100 + p.month;
    if (ym > periodYm) e.push(warn(field, `Invoice date ${raw} is after the return period ${ctx.period}`));
  }
}

// ── The core inter/intra tax-split rules the user asked for ──
function applyTaxLogic(section: SectionDef, data: Record<string, any>, ctx: ValidationContext, e: ValidationError[]): void {
  const pos = posCode(data.pos);
  // Sections that are inherently inter-state
  const alwaysInter = section.key === 'b2cl' || section.key === 'exp';
  const sez = /SEZ|Deemed|Intra-State supplies attracting IGST/i.test(String(data.invoiceType ?? data.noteSupplyType ?? ''));

  // HSN sheet carries explicit IGST/CGST/SGST — validate the split directly.
  const rate = toNumber(data.rate), taxable = toNumber(data.taxableValue);
  const expected = round2((taxable * rate) / 100);

  // Explicit tax amounts: HSN uses igst/cgst/sgst; flat-format invoice rows use iamt/camt/samt.
  const igst = toNumber(data.igst ?? data.iamt);
  const cgst = toNumber(data.cgst ?? data.camt);
  const sgst = toNumber(data.sgst ?? data.samt);
  const hasAmounts = igst > 0 || cgst > 0 || sgst > 0;

  // Resolve inter/intra from POS where we have it.
  const knowPos = !!pos && !!ctx.supplierStateCode;
  const interByPos = alwaysInter || sez || (knowPos && pos !== ctx.supplierStateCode);
  const intraByPos = knowPos && !interByPos;
  if (knowPos) data.__supplyType = interByPos ? 'INTER' : 'INTRA';

  // B2CL is inter-state only.
  if (section.key === 'b2cl' && knowPos && pos === ctx.supplierStateCode) {
    e.push(err('pos', `B2CL is inter-state only — POS (${pos}) equals supplier state (${ctx.supplierStateCode})`, 'RET191150'));
  }

  if (hasAmounts && section.key === 'hsn') {
    // HSN summary (table 12) legitimately aggregates intra + inter supplies of the
    // same HSN, so IGST and CGST/SGST can coexist. Only sanity-check the totals.
    if ((cgst > 0 || sgst > 0) && Math.abs(cgst - sgst) > Math.max(1, (cgst + sgst) * 0.01)) {
      e.push(warn('CentralTaxAmount', `CGST (${cgst}) and SGST (${sgst}) should be equal`));
    }
    const totalTax = round2(igst + cgst + sgst);
    if (expected > 0 && Math.abs(totalTax - expected) > Math.max(AMOUNT_TOL, expected * 0.02)) {
      e.push(warn('IntegratedTaxAmount', `Tax (${totalTax}) ≠ rate×taxable (${expected})`));
    }
  } else if (hasAmounts) {
    const hasInter = igst > 0;
    const hasIntra = cgst > 0 || sgst > 0;
    if (hasInter && hasIntra) {
      e.push(err('IntegratedTaxAmount', 'A line cannot carry IGST and CGST/SGST together', 'RET191150'));
    } else if (hasIntra) {
      if (Math.abs(cgst - sgst) > 1) e.push(err('CentralTaxAmount', `CGST (${cgst}) and SGST (${sgst}) must be equal`, 'RET191151'));
      if (expected > 0 && Math.abs(cgst + sgst - expected) > 1) e.push(err('CentralTaxAmount', `Reverse-arithmetic: CGST+SGST (${round2(cgst + sgst)}) ≠ rate×taxable (${expected})`, 'RET191175'));
      if (interByPos) e.push(err('CentralTaxAmount', `Inter-state supply (POS ${pos} ≠ supplier ${ctx.supplierStateCode}) must use IGST, not CGST/SGST`, 'RET191150'));
    } else if (hasInter) {
      if (expected > 0 && Math.abs(igst - expected) > 1) e.push(err('IntegratedTaxAmount', `Reverse-arithmetic: IGST (${igst}) ≠ rate×taxable (${expected})`, 'RET191175'));
      if (intraByPos) e.push(err('IntegratedTaxAmount', `Intra-state supply (POS = supplier state ${pos}) must use CGST+SGST, not IGST`, 'RET191150'));
    }
  } else if (rate > 0 && taxable > 0 && section.key === 'hsn') {
    e.push(warn('igst', 'Rate is non-zero but no tax amount entered'));
  }
}

function applySectionRules(section: SectionDef, data: Record<string, any>, ctx: ValidationContext | undefined, e: ValidationError[]): void {
  switch (section.key) {
    case 'b2cl': {
      const v = toNumber(data.invoiceValue);
      if (v > 0 && v <= 100000) e.push(warn('invoiceValue', 'B2CL invoice value should exceed ₹1,00,000', 'RET191167'));
      if (data.partialCtin) e.push(warn('ctin', `CustomerGSTIN "${data.partialCtin}" is not 15 chars — treated as B2C; verify B2B/B2C classification`));
      break;
    }
    case 'b2cs': {
      if (data.partialCtin) e.push(warn('ctin', `CustomerGSTIN "${data.partialCtin}" is not 15 chars — treated as B2C; verify B2B/B2C classification`));
      break;
    }
    case 'b2b':
    case 'cdnr':
    case 'cdnur': {
      const inv = toNumber(data.invoiceValue ?? data.noteValue);
      const tax = toNumber(data.taxableValue);
      if (inv > 0 && tax > inv + AMOUNT_TOL) e.push(warn('taxableValue', 'Taxable value exceeds invoice/note value'));
      // Credit/Debit notes must reference a valid original invoice + date.
      if (section.key === 'cdnr' || section.key === 'cdnur') {
        if (!String(data.origInvoiceNumber ?? '').trim()) e.push(err('origInvoiceNumber', 'Credit/Debit note must reference the Original Invoice Number', 'RET191115'));
        if (!String(data.origInvoiceDate ?? '').trim()) e.push(warn('origInvoiceDate', 'Original Invoice Date is recommended for credit/debit notes'));
      }
      break;
    }
    case 'exp': {
      const rate = toNumber(data.rate);
      const t = String(data.exportType ?? '').toUpperCase();
      if (t === 'WOPAY' && rate > 0) e.push(warn('rate', 'Export WITHOUT payment of tax should have 0% rate'));
      if (t === 'WPAY' && rate === 0) e.push(warn('rate', 'Export WITH payment of tax should have a non-zero rate'));
      // Zero-rated: shipping bill expected to claim refund / close the export.
      if (!String(data.shippingBillNumber ?? '').trim()) e.push(warn('shippingBillNumber', 'Shipping bill number missing for export (can be added later, required to claim refund)'));
      break;
    }
    case 'hsn': {
      const uqc = String(data.uqc ?? '').trim().toUpperCase();
      if (uqc && !UQC_MASTER.has(uqc)) e.push(warn('uqc', `UQC "${uqc}" is not a valid unit code`));
      const isService = String(data.hsn ?? '').startsWith('99');
      if (!isService && toNumber(data.quantity) <= 0) e.push(warn('quantity', `Quantity required for goods (HSN ${data.hsn})`));
      break;
    }
    case 'docs': {
      const total = toNumber(data.totalNumber), cancel = toNumber(data.cancelled);
      if (cancel > total) e.push(err('cancelled', `Cancelled (${cancel}) cannot exceed Total (${total})`));
      break;
    }
    case 'nil': {
      if (!toNumber(data.nilSupplies) && !toNumber(data.exemptedSupplies) && !toNumber(data.nonGstSupplies)) {
        e.push(warn('description', 'Row has no nil / exempt / non-GST amounts'));
      }
      break;
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// Dataset-level validation: per-row + cross-row (duplicates, invoice value)
// ════════════════════════════════════════════════════════════════════
export function validateDataset(records: ParsedRecord[], ctx: ValidationContext): { records: ParsedRecord[]; validation: ValidationSummary } {
  // 1. per-row
  for (const r of records) {
    const section = SECTION_MAP[r.section];
    if (!section) continue;
    r.errors = validateRecord(section, r.data, ctx);
  }

  // 2. cross-row: duplicate lines + invoice-value consistency
  crossRowChecks(records, ctx);

  // finalize validity
  for (const r of records) r.isValid = !r.errors.some((x) => x.severity === 'error');

  return { records, validation: summarize(records) };
}

function crossRowChecks(records: ParsedRecord[], ctx: ValidationContext): void {
  const sections = new Set(records.map((r) => r.section));
  for (const sec of sections) {
    const def = SECTION_MAP[sec];
    if (!def || !def.hasTax) continue;
    const rows = records.filter((r) => r.section === sec);

    // duplicate identical line signatures
    const seen = new Map<string, ParsedRecord>();
    for (const r of rows) {
      const sig = `${def.matchKey(r.data)}|${toNumber(r.data.rate)}|${posCode(r.data.pos)}`;
      if (seen.has(sig)) r.errors.push(warn('invoiceNumber', 'Duplicate line (same key, rate & POS)', 'RET191102'));
      else seen.set(sig, r);
    }

    // invoice-value consistency for invoice/note based sections.
    // Exports excluded: export invoice value = FOB and IGST is separate/refundable.
    if (['b2b', 'cdnr', 'b2cl'].includes(sec)) {
      const groups = new Map<string, ParsedRecord[]>();
      for (const r of rows) {
        const key = def.matchKey(r.data);
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
      }
      for (const [, grp] of groups) {
        const stated = grp.map((g) => toNumber(g.data.invoiceValue ?? g.data.noteValue));
        const statedVal = stated.find((v) => v > 0) ?? 0;
        // all lines of one invoice must carry the same invoice value
        if (new Set(stated.filter((v) => v > 0)).size > 1) {
          grp.forEach((g) => g.errors.push(err('invoiceValue', 'Invoice value differs across rate lines of the same invoice')));
        }
        // computed = Σ taxable + Σ tax + Σ cess
        let taxable = 0, tax = 0, cess = 0;
        for (const g of grp) {
          const tv = toNumber(g.data.taxableValue);
          taxable += tv; tax += (tv * toNumber(g.data.rate)) / 100; cess += toNumber(g.data.cessAmount);
        }
        const computed = round2(taxable + tax + cess);
        // Round-off & cross-foot: grand total should equal taxable+tax+cess within rounding (±₹1).
        if (statedVal > 0 && Math.abs(computed - statedVal) > 1) {
          grp[0].errors.push(warn('invoiceValue', `Cross-foot: invoice value ${statedVal} ≠ taxable+tax+cess (computed ${computed}); round-off beyond ±0.99`));
        }
      }
    }
  }

  // Duplicate invoice number per supplier-FY: same number used for >1 recipient.
  const b2b = records.filter((r) => r.section === 'b2b' && r.data.invoiceNumber);
  const byNumber = new Map<string, Set<string>>();
  for (const r of b2b) {
    const num = String(r.data.invoiceNumber).trim().toUpperCase();
    (byNumber.get(num) ?? byNumber.set(num, new Set()).get(num)!).add(String(r.data.ctin || '').toUpperCase());
  }
  for (const r of b2b) {
    const num = String(r.data.invoiceNumber).trim().toUpperCase();
    if ((byNumber.get(num)?.size ?? 0) > 1) {
      r.errors.push(err('invoiceNumber', `Duplicate invoice number "${r.data.invoiceNumber}" used for more than one recipient`, 'RET191102'));
    }
  }

  // Cross-upload duplicate: invoice number already filed for this registration in the FY.
  const priorNumbers = new Set((ctx.existingInvoiceNumbers || []).map((n) => String(n).trim().toUpperCase()));
  if (priorNumbers.size) {
    for (const r of records.filter((x) => ['b2b', 'b2cl', 'exp'].includes(x.section) && x.data.invoiceNumber)) {
      if (priorNumbers.has(String(r.data.invoiceNumber).trim().toUpperCase())) {
        r.errors.push(err('invoiceNumber', `Invoice number "${r.data.invoiceNumber}" was already uploaded for this GSTIN in the current financial year`, 'RET191102'));
      }
    }
  }

  // Credit/Debit note → original invoice linkage: warn if the referenced original
  // invoice is not present in this upload (it may belong to an earlier period).
  const invoiceNumbers = new Set(
    records.filter((r) => ['b2b', 'b2cl', 'exp'].includes(r.section) && r.data.invoiceNumber)
      .map((r) => String(r.data.invoiceNumber).trim().toUpperCase())
  );
  for (const r of records) {
    if (r.section !== 'cdnr' && r.section !== 'cdnur') continue;
    const orig = String(r.data.origInvoiceNumber ?? '').trim().toUpperCase();
    if (orig && invoiceNumbers.size && !invoiceNumbers.has(orig)) {
      r.errors.push(warn('origInvoiceNumber', `Original invoice "${r.data.origInvoiceNumber}" not found in this upload — verify it was reported in an earlier period`));
    }
  }
}

function summarize(records: ParsedRecord[]): ValidationSummary {
  const bySection: ValidationSummary['bySection'] = {};
  const byCode: Record<string, number> = {};
  const issueAgg = new Map<string, { code: string; message: string; count: number; severity: 'error' | 'warning' }>();
  let errors = 0, warnings = 0, errorRows = 0, warningRows = 0, validRows = 0;

  for (const r of records) {
    const sec = (bySection[r.section] ??= { rows: 0, errors: 0, warnings: 0 });
    sec.rows += 1;
    const rowErrors = r.errors.filter((e) => e.severity === 'error');
    const rowWarns = r.errors.filter((e) => e.severity === 'warning');
    sec.errors += rowErrors.length; sec.warnings += rowWarns.length;
    errors += rowErrors.length; warnings += rowWarns.length;
    if (rowErrors.length) errorRows += 1; else validRows += 1;
    if (rowWarns.length) warningRows += 1;
    for (const e of r.errors) {
      const code = e.code ?? e.severity.toUpperCase();
      byCode[code] = (byCode[code] ?? 0) + 1;
      const key = code + '|' + e.message.replace(/[0-9₹.,]+/g, '#');
      const agg = issueAgg.get(key);
      if (agg) agg.count += 1;
      else issueAgg.set(key, { code, message: e.message, count: 1, severity: e.severity });
    }
  }

  const topIssues = [...issueAgg.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  const status: ValidationSummary['status'] = errors > 0 ? 'errors' : warnings > 0 ? 'warnings' : 'clean';
  return {
    status,
    totals: { rows: records.length, validRows, errorRows, warningRows, errors, warnings },
    bySection, byCode, topIssues,
  };
}
