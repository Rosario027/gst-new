// Shared helpers for GSTR-1: state codes, POS parsing, money/tax math, dates.

export const STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh',
  '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

/** Accepts "27-Maharashtra", "27", 27, "Maharashtra" -> "27". */
export function posCode(pos: any): string {
  const s = String(pos ?? '').trim();
  const m = s.match(/^(\d{1,2})/);
  if (m) return m[1].padStart(2, '0');
  // try matching by name
  const byName = Object.entries(STATE_NAMES).find(([, n]) => n.toLowerCase() === s.toLowerCase());
  return byName ? byName[0] : '';
}

export function posLabel(pos: any): string {
  const code = posCode(pos);
  return code ? `${code}-${STATE_NAMES[code] ?? ''}` : String(pos ?? '');
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toNumber(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export interface TaxSplit {
  iamt: number; // IGST
  camt: number; // CGST
  samt: number; // SGST/UTGST
  csamt: number; // Cess
}

/**
 * Split tax into IGST or CGST+SGST based on supplier state vs place of supply.
 * Intra-state (same state) -> CGST + SGST; inter-state -> IGST.
 */
export function computeTax(opts: {
  supplierStateCode: string;
  pos: string;
  rate: number;
  taxableValue: number;
  cessAmount?: number;
  forceInterState?: boolean; // exports, SEZ, B2CL are always inter-state
}): TaxSplit {
  const rate = toNumber(opts.rate);
  const taxable = toNumber(opts.taxableValue);
  const tax = round2((taxable * rate) / 100);
  const posC = posCode(opts.pos);
  const interState = opts.forceInterState || posC !== opts.supplierStateCode;
  const csamt = round2(toNumber(opts.cessAmount));
  if (interState) {
    return { iamt: tax, camt: 0, samt: 0, csamt };
  }
  const half = round2(tax / 2);
  return { iamt: 0, camt: half, samt: round2(tax - half), csamt };
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Parse a date cell (Date | "DD-MMM-YYYY" | "DD/MM/YYYY" | excel serial) -> "DD-MM-YYYY" (GSTN format). */
export function toGstnDate(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return fmt(v.getUTCDate(), v.getUTCMonth() + 1, v.getUTCFullYear());
  const s = String(v).trim();
  // DD-MMM-YYYY
  let m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{4})$/);
  if (m) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
    if (mon > 0) return fmt(+m[1], mon, +m[3]);
  }
  // DD-MM-YYYY or DD/MM/YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return fmt(+m[1], +m[2], +m[3]);
  // YYYY-MM-DD
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return fmt(+m[3], +m[2], +m[1]);
  return s;
}

function fmt(d: number, m: number, y: number): string {
  return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
}

/** "052026" -> { fp, month, year }. fp is "MMYYYY" as GSTN expects. */
export function parsePeriod(period: string): { fp: string; month: number; year: number } {
  const p = String(period).padStart(6, '0');
  return { fp: p, month: +p.slice(0, 2), year: +p.slice(2) };
}
