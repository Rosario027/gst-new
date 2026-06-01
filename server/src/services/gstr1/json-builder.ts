import { ParsedRecord } from '../../types';
import { computeTax, posCode, round2, toNumber, toGstnDate, parsePeriod } from './util';
import { panFromGstin } from '../gstin';

export interface BuildOptions {
  gstin: string;
  period: string; // MMYYYY
  /** Only include valid records (default true). */
  validOnly?: boolean;
}

/**
 * Build the GSTR-1 portal JSON from normalized books records.
 * Output conforms to the GSTN GSTR-1 offline-tool / API JSON schema.
 */
export function buildGstr1Json(records: ParsedRecord[], opts: BuildOptions): Record<string, any> {
  const stateCode = opts.gstin.slice(0, 2);
  const { fp } = parsePeriod(opts.period);
  const rows = (opts.validOnly === false ? records : records.filter((r) => r.isValid));

  const bySection = (key: string) => rows.filter((r) => r.section === key).map((r) => r.data);

  const out: Record<string, any> = { gstin: opts.gstin, fp };

  const b2b = buildB2b(bySection('b2b'), stateCode);
  if (b2b.length) out.b2b = b2b;

  const b2cl = buildB2cl(bySection('b2cl'));
  if (b2cl.length) out.b2cl = b2cl;

  const b2cs = buildB2cs(bySection('b2cs'), stateCode);
  if (b2cs.length) out.b2cs = b2cs;

  const cdnr = buildCdnr(bySection('cdnr'), stateCode);
  if (cdnr.length) out.cdnr = cdnr;

  const cdnur = buildCdnur(bySection('cdnur'));
  if (cdnur.length) out.cdnur = cdnur;

  const exp = buildExp(bySection('exp'));
  if (exp.length) out.exp = exp;

  const nil = buildNil(bySection('nil'));
  if (nil) out.nil = nil;

  const hsn = buildHsn(bySection('hsn'), stateCode);
  if (hsn) out.hsn = hsn;

  const docs = buildDocs(bySection('docs'));
  if (docs) out.doc_issue = docs;

  const at = buildAdvances(bySection('at'), stateCode, 'ad_amt');
  if (at.length) out.at = at;

  const txpd = buildAdvances(bySection('atadj'), stateCode, 'ad_amt');
  if (txpd.length) out.txpd = txpd;

  return out;
}

/** Use explicit tax amounts from the row when present (flat format), else compute. */
function resolveSplit(l: Record<string, any>, opts: { supplierStateCode: string; pos: any; forceInterState?: boolean }): ReturnType<typeof computeTax> {
  const iamt = toNumber(l.iamt), camt = toNumber(l.camt), samt = toNumber(l.samt);
  if (iamt > 0 || camt > 0 || samt > 0) {
    return { iamt: round2(iamt), camt: round2(camt), samt: round2(samt), csamt: round2(toNumber(l.cessAmount)) };
  }
  return computeTax({ supplierStateCode: opts.supplierStateCode, pos: opts.pos, rate: toNumber(l.rate), taxableValue: toNumber(l.taxableValue), cessAmount: toNumber(l.cessAmount), forceInterState: opts.forceInterState });
}

function itm(rate: number, split: ReturnType<typeof computeTax>, txval: number): any {
  const det: any = { rt: round2(rate), txval: round2(txval) };
  if (split.iamt) det.iamt = split.iamt;
  if (split.camt) det.camt = split.camt;
  if (split.samt) det.samt = split.samt;
  det.csamt = split.csamt;
  return det;
}

function buildB2b(data: Record<string, any>[], stateCode: string): any[] {
  const byCtin = groupBy(data, (r) => String(r.ctin).toUpperCase());
  return Object.entries(byCtin).map(([ctin, recs]) => {
    const byInv = groupBy(recs, (r) => String(r.invoiceNumber));
    const inv = Object.entries(byInv).map(([inum, lines]) => {
      const first = lines[0];
      const sez = /SEZ/i.test(first.invoiceType ?? '');
      const items = lines.map((l, i) => {
        const split = resolveSplit(l, { supplierStateCode: stateCode, pos: l.pos, forceInterState: sez });
        return { num: i + 1, itm_det: itm(toNumber(l.rate), split, toNumber(l.taxableValue)) };
      });
      const o: any = {
        inum, idt: toGstnDate(first.invoiceDate), val: round2(toNumber(first.invoiceValue)),
        pos: posCode(first.pos), rchrg: (first.reverseCharge ?? 'N').toUpperCase() === 'Y' ? 'Y' : 'N',
        inv_typ: invTypeCode(first.invoiceType), itms: items,
      };
      if (first.ecomGstin) o.etin = first.ecomGstin;
      return o;
    });
    return { ctin, inv };
  });
}

function buildB2cl(data: Record<string, any>[]): any[] {
  const byPos = groupBy(data, (r) => posCode(r.pos));
  return Object.entries(byPos).map(([pos, recs]) => {
    const byInv = groupBy(recs, (r) => String(r.invoiceNumber));
    const inv = Object.entries(byInv).map(([inum, lines]) => {
      const first = lines[0];
      const items = lines.map((l, i) => ({
        num: i + 1,
        itm_det: { rt: round2(toNumber(l.rate)), txval: round2(toNumber(l.taxableValue)),
          iamt: round2((toNumber(l.taxableValue) * toNumber(l.rate)) / 100), csamt: round2(toNumber(l.cessAmount)) },
      }));
      const o: any = { inum, idt: toGstnDate(first.invoiceDate), val: round2(toNumber(first.invoiceValue)), itms: items };
      if (first.ecomGstin) o.etin = first.ecomGstin;
      return o;
    });
    return { pos, inv };
  });
}

function buildB2cs(data: Record<string, any>[], stateCode: string): any[] {
  // already rate-wise rows; emit one entry per (pos, rate, type, etin)
  return data.map((r) => {
    const pos = posCode(r.pos);
    const split = resolveSplit(r, { supplierStateCode: stateCode, pos });
    const inter = pos !== stateCode;
    const o: any = {
      sply_ty: inter ? 'INTER' : 'INTRA',
      pos, typ: (r.type ?? 'OE').toUpperCase() === 'E' ? 'E' : 'OE',
      rt: round2(toNumber(r.rate)), txval: round2(toNumber(r.taxableValue)),
      csamt: split.csamt,
    };
    if (inter) o.iamt = split.iamt; else { o.camt = split.camt; o.samt = split.samt; }
    if (r.ecomGstin) o.etin = r.ecomGstin;
    return o;
  });
}

function buildCdnr(data: Record<string, any>[], stateCode: string): any[] {
  const byCtin = groupBy(data, (r) => String(r.ctin).toUpperCase());
  return Object.entries(byCtin).map(([ctin, recs]) => {
    const byNote = groupBy(recs, (r) => String(r.noteNumber));
    const nt = Object.entries(byNote).map(([nt_num, lines]) => {
      const first = lines[0];
      const items = lines.map((l, i) => {
        const split = resolveSplit(l, { supplierStateCode: stateCode, pos: l.pos });
        return { num: i + 1, itm_det: itm(toNumber(l.rate), split, toNumber(l.taxableValue)) };
      });
      return {
        ntty: (first.noteType ?? 'C').toUpperCase().startsWith('D') ? 'D' : 'C',
        nt_num, nt_dt: toGstnDate(first.noteDate), val: round2(toNumber(first.noteValue)),
        pos: posCode(first.pos), rchrg: (first.reverseCharge ?? 'N').toUpperCase() === 'Y' ? 'Y' : 'N',
        inv_typ: invTypeCode(first.noteSupplyType), itms: items,
      };
    });
    return { ctin, nt };
  });
}

function buildCdnur(data: Record<string, any>[]): any[] {
  return Object.entries(groupBy(data, (r) => String(r.noteNumber))).map(([nt_num, lines]) => {
    const first = lines[0];
    const items = lines.map((l, i) => ({
      num: i + 1,
      itm_det: { rt: round2(toNumber(l.rate)), txval: round2(toNumber(l.taxableValue)),
        iamt: round2((toNumber(l.taxableValue) * toNumber(l.rate)) / 100), csamt: round2(toNumber(l.cessAmount)) },
    }));
    return {
      typ: (first.urType ?? 'B2CL').toUpperCase(),
      ntty: (first.noteType ?? 'C').toUpperCase().startsWith('D') ? 'D' : 'C',
      nt_num, nt_dt: toGstnDate(first.noteDate), val: round2(toNumber(first.noteValue)),
      pos: posCode(first.pos), itms: items,
    };
  });
}

function buildExp(data: Record<string, any>[]): any[] {
  const byType = groupBy(data, (r) => (r.exportType ?? 'WPAY').toUpperCase());
  return Object.entries(byType).map(([exp_typ, recs]) => {
    const inv = Object.entries(groupBy(recs, (r) => String(r.invoiceNumber))).map(([inum, lines]) => {
      const first = lines[0];
      const o: any = {
        inum, idt: toGstnDate(first.invoiceDate), val: round2(toNumber(first.invoiceValue)),
        itms: lines.map((l) => ({ txval: round2(toNumber(l.taxableValue)), rt: round2(toNumber(l.rate)),
          iamt: exp_typ === 'WPAY' ? round2((toNumber(l.taxableValue) * toNumber(l.rate)) / 100) : 0,
          csamt: round2(toNumber(l.cessAmount)) })),
      };
      if (first.portCode) o.sbpcode = first.portCode;
      if (first.shippingBillNumber) o.sbnum = String(first.shippingBillNumber);
      if (first.shippingBillDate) o.sbdt = toGstnDate(first.shippingBillDate);
      return o;
    });
    return { exp_typ, inv };
  });
}

const NIL_TYPE: Record<string, string> = {
  'inter b2b': 'INTRB2B', 'intra b2b': 'INTRAB2B', 'inter b2c': 'INTRB2C', 'intra b2c': 'INTRAB2C',
};
function buildNil(data: Record<string, any>[]): any | null {
  if (!data.length) return null;
  const inv = data.map((r) => {
    const key = String(r.description ?? '').toLowerCase();
    const sply_ty = Object.entries(NIL_TYPE).find(([k]) => key.includes(k))?.[1] ?? 'INTRB2B';
    return { sply_ty, nil_amt: round2(toNumber(r.nilSupplies)), expt_amt: round2(toNumber(r.exemptedSupplies)), ngsup_amt: round2(toNumber(r.nonGstSupplies)) };
  });
  return { inv };
}

function buildHsn(data: Record<string, any>[], stateCode: string): any | null {
  if (!data.length) return null;
  const dataArr = data.map((r, i) => {
    const rate = toNumber(r.rate);
    const txval = toNumber(r.taxableValue);
    // use provided tax columns if present, else compute (assume intra split unless igst provided)
    let iamt = toNumber(r.igst), camt = toNumber(r.cgst), samt = toNumber(r.sgst);
    if (!iamt && !camt && !samt) {
      const split = computeTax({ supplierStateCode: stateCode, pos: stateCode, rate, taxableValue: txval });
      iamt = split.iamt; camt = split.camt; samt = split.samt;
    }
    return {
      num: i + 1, hsn_sc: String(r.hsn), desc: r.description ?? '', uqc: String(r.uqc ?? 'OTH').toUpperCase(),
      qty: round2(toNumber(r.quantity)), val: round2(toNumber(r.totalValue)), txval: round2(txval),
      iamt: round2(iamt), camt: round2(camt), samt: round2(samt), csamt: round2(toNumber(r.cessAmount)), rt: round2(rate),
    };
  });
  return { data: dataArr };
}

function buildDocs(data: Record<string, any>[]): any | null {
  if (!data.length) return null;
  const docs = data.map((r, i) => {
    const totnum = Math.round(toNumber(r.totalNumber));
    const cancel = Math.round(toNumber(r.cancelled));
    return { num: i + 1, from: String(r.srNoFrom), to: String(r.srNoTo), totnum, cancel, net_issue: totnum - cancel };
  });
  return { doc_det: [{ doc_num: 1, docs }] };
}

function buildAdvances(data: Record<string, any>[], stateCode: string, amtKey: string): any[] {
  const byPos = groupBy(data, (r) => posCode(r.pos));
  return Object.entries(byPos).map(([pos, recs]) => {
    const inter = pos !== stateCode;
    return {
      pos, sply_ty: inter ? 'INTER' : 'INTRA',
      itms: recs.map((r) => {
        const split = computeTax({ supplierStateCode: stateCode, pos, rate: toNumber(r.rate), taxableValue: toNumber(r.grossAdvance), cessAmount: toNumber(r.cessAmount) });
        const it: any = { rt: round2(toNumber(r.rate)), [amtKey]: round2(toNumber(r.grossAdvance)), csamt: split.csamt };
        if (inter) it.iamt = split.iamt; else { it.camt = split.camt; it.samt = split.samt; }
        return it;
      }),
    };
  });
}

// ── helpers ──
function groupBy<T>(arr: T[], keyFn: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) (out[keyFn(item)] ??= []).push(item);
  return out;
}

function invTypeCode(label?: string): string {
  const l = String(label ?? '').toLowerCase();
  if (l.includes('sez') && l.includes('without')) return 'SEWOP';
  if (l.includes('sez')) return 'SEWP';
  if (l.includes('deemed')) return 'DE';
  return 'R';
}
