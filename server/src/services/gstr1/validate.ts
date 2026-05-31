import { SectionDef, ColumnDef, SECTION_MAP } from './sections';
import { ValidationError, ValidationContext, ValidationSummary, ParsedRecord } from '../../types';
import { isValidGstin, isValidGstinFormat } from '../gstin';
import { posCode, toNumber, round2, parsePeriod } from './util';

// Combined GST rate slabs valid in the rate-wise sheets (CGST+SGST or IGST).
const VALID_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];
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

  // 5. Inter / intra-state tax logic (needs supplier context)
  if (ctx) applyTaxLogic(section, data, ctx, e);

  // 6. Section-specific rules
  applySectionRules(section, data, ctx, e);

  return e;
}

function validateByType(col: ColumnDef, value: any, e: ValidationError[]): void {
  const v = String(value).trim();
  switch (col.type) {
    case 'gstin':
      if (!isValidGstinFormat(v)) e.push(err(col.key, `Invalid GSTIN format: ${v}`, 'RET191113'));
      else if (!isValidGstin(v)) e.push(err(col.key, `Invalid GSTIN checksum: ${v}`, 'RET191113'));
      break;
    case 'number':
      if (!Number.isFinite(toNumber(v))) e.push(err(col.key, `${col.header} must be a number`));
      break;
    case 'rate':
      if (!VALID_RATES.includes(toNumber(v))) e.push(err(col.key, `Invalid GST rate: ${v}% (allowed: ${VALID_RATES.join(', ')})`, 'RET191175'));
      break;
    case 'pos':
      if (!posCode(v)) e.push(err(col.key, `Invalid Place of Supply: ${v}`, 'RET191134'));
      break;
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
  if (section.key === 'hsn') {
    const igst = toNumber(data.igst), cgst = toNumber(data.cgst), sgst = toNumber(data.sgst);
    const rate = toNumber(data.rate), taxable = toNumber(data.taxableValue);
    const expected = round2((taxable * rate) / 100);
    const supplyIsB2c = String(data.supplyType ?? '').toUpperCase() === 'B2C';
    // We can't always know POS at HSN level; rely on which taxes are filled.
    const hasInter = igst > 0;
    const hasIntra = cgst > 0 || sgst > 0;
    if (hasInter && hasIntra) {
      e.push(err('igst', 'A line cannot carry IGST and CGST/SGST together', 'RET191150'));
    } else if (hasIntra) {
      if (Math.abs(cgst - sgst) > 1) e.push(err('cgst', `CGST (${cgst}) and SGST (${sgst}) must be equal`, 'RET191151'));
      if (expected > 0 && Math.abs(cgst + sgst - expected) > AMOUNT_TOL) {
        e.push(warn('cgst', `CGST+SGST (${round2(cgst + sgst)}) ≠ rate×taxable (${expected})`));
      }
    } else if (hasInter) {
      if (expected > 0 && Math.abs(igst - expected) > AMOUNT_TOL) {
        e.push(warn('igst', `IGST (${igst}) ≠ rate×taxable (${expected})`));
      }
    } else if (rate > 0 && taxable > 0 && !supplyIsB2c) {
      e.push(warn('igst', 'Rate is non-zero but no tax amount entered'));
    }
    return;
  }

  // For the invoice sheets (b2b, cdnr, b2cs, at, atadj) there are no tax-amount
  // columns, but we still enforce the POS↔supplier-state relationship.
  if (!pos || !ctx.supplierStateCode) return;
  const interState = pos !== ctx.supplierStateCode || alwaysInter || sez;

  if (section.key === 'b2cl' && pos === ctx.supplierStateCode) {
    e.push(err('pos', `B2CL is inter-state only — POS (${pos}) equals supplier state (${ctx.supplierStateCode})`, 'RET191150'));
  }
  if (section.key === 'b2cs' && data.type) {
    // sply_ty derived later; nothing to block here
  }
  // Stash the resolved supply type for downstream consumers / report clarity
  data.__supplyType = interState ? 'INTER' : 'INTRA';
}

function applySectionRules(section: SectionDef, data: Record<string, any>, ctx: ValidationContext | undefined, e: ValidationError[]): void {
  switch (section.key) {
    case 'b2cl': {
      const v = toNumber(data.invoiceValue);
      if (v > 0 && v <= 100000) e.push(warn('invoiceValue', 'B2CL invoice value should exceed ₹1,00,000', 'RET191167'));
      break;
    }
    case 'b2b':
    case 'cdnr': {
      const inv = toNumber(data.invoiceValue ?? data.noteValue);
      const tax = toNumber(data.taxableValue);
      if (inv > 0 && tax > inv + AMOUNT_TOL) e.push(warn('taxableValue', 'Taxable value exceeds invoice/note value'));
      break;
    }
    case 'exp': {
      const rate = toNumber(data.rate);
      const t = String(data.exportType ?? '').toUpperCase();
      if (t === 'WOPAY' && rate > 0) e.push(warn('rate', 'Export WITHOUT payment of tax should have 0% rate'));
      if (t === 'WPAY' && rate === 0) e.push(warn('rate', 'Export WITH payment of tax should have a non-zero rate'));
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
        if (statedVal > 0 && Math.abs(computed - statedVal) > Math.max(AMOUNT_TOL, statedVal * 0.01)) {
          grp[0].errors.push(warn('invoiceValue', `Invoice value ${statedVal} ≠ taxable+tax+cess (computed ${computed})`));
        }
      }
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
