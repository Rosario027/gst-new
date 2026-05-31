import { SECTION_MAP } from './sections';
import { ParsedRecord, ReconLine, ReconSummary, ReconStatus, SectionKey } from '../../types';
import { toNumber, round2 } from './util';

// Fields compared for a "mismatch" verdict, per matched pair.
const COMPARE_FIELDS = ['taxableValue', 'rate', 'cessAmount', 'invoiceValue', 'noteValue', 'pos'];
const TOLERANCE = 1; // ₹1 rounding tolerance on amounts

export interface ReconResult {
  lines: ReconLine[];
  summary: ReconSummary;
}

/**
 * Reconcile books (base) against a comparison source (e-invoice / portal).
 * Matched by section + section.matchKey. Within a matched key, taxable/rate/
 * value differences beyond tolerance are flagged as mismatches.
 */
export function reconcile(base: ParsedRecord[], compare: ParsedRecord[]): ReconResult {
  const lines: ReconLine[] = [];
  const summary: ReconSummary = { matched: 0, mismatch: 0, onlyInBooks: 0, onlyInCompare: 0, bySection: {} };

  const sections = new Set<SectionKey>([...base, ...compare].map((r) => r.section));

  for (const section of sections) {
    const def = SECTION_MAP[section];
    if (!def) continue;

    const baseRows = group(base.filter((r) => r.section === section), def.matchKey);
    const compRows = group(compare.filter((r) => r.section === section), def.matchKey);
    const keys = new Set([...baseRows.keys(), ...compRows.keys()]);

    for (const key of keys) {
      const b = baseRows.get(key);
      const c = compRows.get(key);
      let status: ReconStatus;
      let diff: ReconLine['diff'] = {};

      if (b && c) {
        diff = fieldDiff(b.data, c.data);
        status = Object.keys(diff).length ? 'mismatch' : 'matched';
      } else if (b) {
        status = 'only_in_books';
      } else {
        status = 'only_in_compare';
      }

      lines.push({
        section,
        matchKey: key,
        status,
        base: b?.data ?? null,
        compare: c?.data ?? null,
        diff,
      });

      const bucket = (summary.bySection[section] ??= { matched: 0, mismatch: 0, onlyInBooks: 0, onlyInCompare: 0 });
      if (status === 'matched') { summary.matched++; bucket.matched++; }
      else if (status === 'mismatch') { summary.mismatch++; bucket.mismatch++; }
      else if (status === 'only_in_books') { summary.onlyInBooks++; bucket.onlyInBooks++; }
      else { summary.onlyInCompare++; bucket.onlyInCompare++; }
    }
  }

  // sort: mismatches and missing first for reviewer attention
  const order: Record<ReconStatus, number> = { mismatch: 0, only_in_books: 1, only_in_compare: 2, matched: 3 };
  lines.sort((a, b) => order[a.status] - order[b.status] || a.section.localeCompare(b.section));

  return { lines, summary };
}

function group(records: ParsedRecord[], keyFn: (r: Record<string, any>) => string): Map<string, ParsedRecord> {
  const map = new Map<string, ParsedRecord>();
  for (const r of records) {
    const key = keyFn(r.data);
    const existing = map.get(key);
    if (existing) {
      // aggregate taxable/cess for duplicate keys (e.g. same invoice multiple rates rolls up per matchKey)
      existing.data = { ...existing.data };
      existing.data.taxableValue = round2(toNumber(existing.data.taxableValue) + toNumber(r.data.taxableValue));
      existing.data.cessAmount = round2(toNumber(existing.data.cessAmount) + toNumber(r.data.cessAmount));
    } else {
      map.set(key, { ...r, data: { ...r.data } });
    }
  }
  return map;
}

function fieldDiff(a: Record<string, any>, b: Record<string, any>): ReconLine['diff'] {
  const diff: ReconLine['diff'] = {};
  for (const f of COMPARE_FIELDS) {
    if (!(f in a) && !(f in b)) continue;
    const av = a[f];
    const bv = b[f];
    const numeric = ['taxableValue', 'rate', 'cessAmount', 'invoiceValue', 'noteValue'].includes(f);
    if (numeric) {
      if (Math.abs(toNumber(av) - toNumber(bv)) > (f === 'rate' ? 0.001 : TOLERANCE)) {
        diff[f] = { books: toNumber(av), compare: toNumber(bv) };
      }
    } else if (String(av ?? '').trim() !== String(bv ?? '').trim()) {
      diff[f] = { books: av ?? null, compare: bv ?? null };
    }
  }
  return diff;
}
