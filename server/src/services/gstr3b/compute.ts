import { ParsedRecord } from '../../types';
import { computeTax, posCode, round2, toNumber, parsePeriod, STATE_NAMES } from '../gstr1/util';

// ════════════════════════════════════════════════════════════════════
// Auto-prepare GSTR-3B from the period's GSTR-1 data.
// Outward side (table 3.1) + inter-state to unregistered (3.2) are derived;
// inward RCM (3.1d) and ITC (table 4) are left for manual entry.
// ════════════════════════════════════════════════════════════════════

export interface TaxTuple { txval: number; iamt: number; camt: number; samt: number; csamt: number; }
const zero = (): TaxTuple => ({ txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 });
function add(t: TaxTuple, txval: number, s: { iamt: number; camt: number; samt: number; csamt: number }, sign = 1): void {
  t.txval = round2(t.txval + sign * txval);
  t.iamt = round2(t.iamt + sign * s.iamt);
  t.camt = round2(t.camt + sign * s.camt);
  t.samt = round2(t.samt + sign * s.samt);
  t.csamt = round2(t.csamt + sign * s.csamt);
}

export interface Gstr3bSummary {
  gstin: string;
  period: string;
  // table 3.1
  osup_det: TaxTuple;        // (a) outward taxable (other than zero/nil/exempt)
  osup_zero: TaxTuple;       // (b) zero-rated (exports + SEZ)
  osup_nil_exmp: TaxTuple;   // (c) nil-rated + exempt (txval only)
  isup_rev: TaxTuple;        // (d) inward reverse charge — manual (0)
  osup_nongst: TaxTuple;     // (e) non-GST (txval only)
  // table 3.2 inter-state supplies to unregistered persons
  inter_unreg: { pos: string; stateName: string; txval: number; iamt: number }[];
  totalTaxLiability: { iamt: number; camt: number; samt: number; csamt: number };
}

function splitFor(r: ParsedRecord, supplierState: string, forceInter: boolean): { iamt: number; camt: number; samt: number; csamt: number } {
  const d = r.data;
  const iamt = toNumber(d.iamt), camt = toNumber(d.camt), samt = toNumber(d.samt);
  if (iamt > 0 || camt > 0 || samt > 0) return { iamt: round2(iamt), camt: round2(camt), samt: round2(samt), csamt: round2(toNumber(d.cessAmount)) };
  const s = computeTax({ supplierStateCode: supplierState, pos: d.pos, rate: toNumber(d.rate), taxableValue: toNumber(d.taxableValue), cessAmount: toNumber(d.cessAmount), forceInterState: forceInter });
  return { iamt: s.iamt, camt: s.camt, samt: s.samt, csamt: s.csamt };
}

export function computeGstr3b(records: ParsedRecord[], opts: { gstin: string; period: string }): Gstr3bSummary {
  const supplierState = opts.gstin.slice(0, 2);
  const out: Gstr3bSummary = {
    gstin: opts.gstin, period: opts.period,
    osup_det: zero(), osup_zero: zero(), osup_nil_exmp: zero(), isup_rev: zero(), osup_nongst: zero(),
    inter_unreg: [], totalTaxLiability: { iamt: 0, camt: 0, samt: 0, csamt: 0 },
  };
  const interMap = new Map<string, { txval: number; iamt: number }>();

  for (const r of records) {
    const d = r.data;
    const taxable = toNumber(d.taxableValue);
    const sec = r.section;

    if (sec === 'nil') {
      out.osup_nil_exmp.txval = round2(out.osup_nil_exmp.txval + toNumber(d.nilSupplies) + toNumber(d.exemptedSupplies));
      out.osup_nongst.txval = round2(out.osup_nongst.txval + toNumber(d.nonGstSupplies));
      continue;
    }
    if (sec === 'hsn') continue; // summary section, avoid double counting

    if (sec === 'exp' || (sec === 'b2b' && /SEZ/i.test(String(d.invoiceType ?? '')))) {
      const s = splitFor(r, supplierState, true);
      add(out.osup_zero, taxable, s);
      continue;
    }

    const isNote = sec === 'cdnr' || sec === 'cdnur';
    const isCredit = isNote && String(d.noteType ?? 'C').toUpperCase().startsWith('C');
    const isAdj = sec === 'atadj';
    const sign = isCredit || isAdj ? -1 : 1;
    const forceInter = sec === 'b2cl';
    const s = splitFor(r, supplierState, forceInter);
    add(out.osup_det, taxable, s, sign);

    // 3.2 inter-state to unregistered: B2CL (always inter) + inter-state B2CS
    if (sec === 'b2cl' || (sec === 'b2cs' && posCode(d.pos) !== supplierState)) {
      const pos = posCode(d.pos);
      const cur = interMap.get(pos) ?? { txval: 0, iamt: 0 };
      cur.txval = round2(cur.txval + taxable);
      cur.iamt = round2(cur.iamt + s.iamt);
      interMap.set(pos, cur);
    }
  }

  out.inter_unreg = [...interMap.entries()]
    .filter(([pos]) => pos)
    .map(([pos, v]) => ({ pos, stateName: STATE_NAMES[pos] ?? '', txval: v.txval, iamt: v.iamt }))
    .sort((a, b) => a.pos.localeCompare(b.pos));

  const liab = out.osup_det;
  out.totalTaxLiability = {
    iamt: round2(out.osup_det.iamt + out.osup_zero.iamt),
    camt: round2(out.osup_det.camt),
    samt: round2(out.osup_det.samt),
    csamt: round2(out.osup_det.csamt + out.osup_zero.csamt),
  };
  void liab;
  return out;
}

/** Build the GSTN GSTR-3B portal JSON (outward side; ITC/RCM left as zeros for manual entry). */
export function buildGstr3bJson(s: Gstr3bSummary): Record<string, any> {
  const { fp } = parsePeriod(s.period);
  const t = (x: TaxTuple, keys: (keyof TaxTuple)[]) => {
    const o: Record<string, number> = {};
    for (const k of keys) o[k] = round2(x[k]);
    return o;
  };
  return {
    gstin: s.gstin,
    ret_period: fp,
    sup_details: {
      osup_det: t(s.osup_det, ['txval', 'iamt', 'camt', 'samt', 'csamt']),
      osup_zero: t(s.osup_zero, ['txval', 'iamt', 'csamt']),
      osup_nil_exmp: { txval: round2(s.osup_nil_exmp.txval) },
      isup_rev: t(s.isup_rev, ['txval', 'iamt', 'camt', 'samt', 'csamt']),
      osup_nongst: { txval: round2(s.osup_nongst.txval) },
    },
    inter_sup: {
      unreg_details: s.inter_unreg.map((u) => ({ pos: u.pos, txval: u.txval, iamt: u.iamt })),
      comp_details: [],
      uin_details: [],
    },
    // Table 4 (ITC) — to be completed from inward reconciliation; emitted as zeros.
    itc_elg: {
      itc_avl: [], itc_rev: [], itc_net: { iamt: 0, camt: 0, samt: 0, csamt: 0 }, itc_inelg: [],
    },
  };
}
