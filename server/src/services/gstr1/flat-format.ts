import ExcelJS from 'exceljs';
import { ParsedRecord, SectionKey } from '../../types';
import { toNumber, round2, toGstnDate, posCode, posLabel, STATE_NAMES } from './util';
import { stateCodeFromGstin } from '../gstin';

// ════════════════════════════════════════════════════════════════════
// FlyPro flat GSTR-1 ingestion format (one row per invoice line).
// Inspired by the enterprise "raw file" layout — a single sheet that the
// tool classifies into GSTR-1 sections (B2B / B2CL / B2CS / CDNR / CDNUR /
// EXP / Nil-Exempt / Advances) using DocumentType + SupplyType + CustomerGSTIN.
// Column names match that layout so files exported from such tools import
// directly; our downloadable template uses a friendly, trimmed subset.
// ════════════════════════════════════════════════════════════════════

export type Req = 'M' | 'C' | 'O'; // Mandatory / Conditional / Optional

export interface FlatColumn {
  key: string;       // canonical key (== header)
  type: 'string' | 'number' | 'date' | 'gstin' | 'rate' | 'pos' | 'master';
  req: Req;
  note?: string;
}

// Friendly template column set (all names match the reference layout).
export const FLAT_COLUMNS: FlatColumn[] = [
  { key: 'ReturnPeriod', type: 'string', req: 'M', note: 'MMYYYY e.g. 052026' },
  { key: 'SupplierGSTIN', type: 'gstin', req: 'M' },
  { key: 'DocumentType', type: 'master', req: 'M', note: 'INV/CR/DR/ADV/ADJ… (Masters)' },
  { key: 'SupplyType', type: 'master', req: 'M', note: 'TAX/SEZ/EXPT/NIL… (Masters)' },
  { key: 'DocumentNumber', type: 'string', req: 'M', note: '≤16 chars; A-Z 0-9 - /' },
  { key: 'DocumentDate', type: 'date', req: 'M', note: 'YYYY-MM-DD' },
  { key: 'OriginalDocumentNumber', type: 'string', req: 'C', note: 'For amendments / credit-debit notes' },
  { key: 'OriginalDocumentDate', type: 'date', req: 'C', note: 'YYYY-MM-DD' },
  { key: 'LineNumber', type: 'number', req: 'O' },
  { key: 'CustomerGSTIN', type: 'gstin', req: 'C', note: 'Mandatory for B2B / registered notes' },
  { key: 'UINorComposition', type: 'master', req: 'O', note: 'U/C/I/G/N/O' },
  { key: 'CustomerName', type: 'string', req: 'O' },
  { key: 'POS', type: 'pos', req: 'M', note: 'Place of supply — 2-digit state code' },
  { key: 'PortCode', type: 'string', req: 'C', note: 'Exports' },
  { key: 'ShippingBillNumber', type: 'string', req: 'C', note: 'Exports' },
  { key: 'ShippingBillDate', type: 'date', req: 'C', note: 'Exports (YYYY-MM-DD)' },
  { key: 'HSNorSAC', type: 'string', req: 'M' },
  { key: 'ProductDescription', type: 'string', req: 'O' },
  { key: 'UnitOfMeasurement', type: 'master', req: 'O', note: 'UQC e.g. NOS, KGS, MTS' },
  { key: 'Quantity', type: 'number', req: 'O' },
  { key: 'TaxableValue', type: 'number', req: 'M' },
  { key: 'IntegratedTaxRate', type: 'rate', req: 'C' },
  { key: 'IntegratedTaxAmount', type: 'number', req: 'C' },
  { key: 'CentralTaxRate', type: 'rate', req: 'C' },
  { key: 'CentralTaxAmount', type: 'number', req: 'C' },
  { key: 'StateUTTaxRate', type: 'rate', req: 'C' },
  { key: 'StateUTTaxAmount', type: 'number', req: 'C' },
  { key: 'CessAmountAdvalorem', type: 'number', req: 'O' },
  { key: 'CessAmountSpecific', type: 'number', req: 'O' },
  { key: 'InvoiceValue', type: 'number', req: 'M', note: 'Total document value incl. tax' },
  { key: 'ReverseChargeFlag', type: 'string', req: 'O', note: 'Y / N' },
  { key: 'eComGSTIN', type: 'gstin', req: 'C', note: 'E-commerce operator GSTIN' },
  { key: 'ReasonForCreditDebitNote', type: 'string', req: 'O' },
];

// Recognized header → canonical key (superset incl. full reference layout).
const ALIAS: Record<string, string> = {};
for (const c of FLAT_COLUMNS) ALIAS[c.key.toLowerCase()] = c.key;
['SourceIdentifier','SourceFileName','GLAccountCode','Division','SubDivision','ProfitCentre1','ProfitCentre2','PlantCode','OriginalCustomerGSTIN','CustomerCode','BillToState','ShipToState','FOB','ExportDuty','ProductCode','CategoryOfProduct','IntegratedTaxRate','CentralTaxRate','StateUTTaxRate','CessRateAdvalorem','CessRateSpecific','TCSFlag','ITCFlag','AccountingVoucherNumber','AccountingVoucherDate','Userdefinedfield1','Userdefinedfield2','Userdefinedfield3']
  .forEach((k) => { ALIAS[k.toLowerCase()] = k; });

// ── Masters ──
export const DOC_TYPES: [string, string][] = [
  ['INV', 'Invoice'], ['RNV', 'Revised Invoice (amendment)'], ['CR', 'Credit Note'], ['RCR', 'Revised Credit Note (amendment)'],
  ['DR', 'Debit Note'], ['RDR', 'Revised Debit Note (amendment)'], ['ADV', 'Advance Received'], ['ADJ', 'Advance Adjusted'],
  ['ANV', 'Updated Invoice (B2C amendment)'], ['ACR', 'Updated Credit Note (B2C amendment)'], ['ADR', 'Updated Debit Note (B2C amendment)'], ['CAN', 'Cancelled document'],
];
export const SUPPLY_TYPES: [string, string][] = [
  ['TAX', 'Taxable supplies'], ['SEZ', 'Supplies to SEZ with payment'], ['NON', 'Non-GST supplies'], ['EXT', 'Exempt'],
  ['DXP', 'Deemed Export'], ['NIL', 'Nil rated'], ['EXPT', 'Export with payment of tax'], ['EXPWT', 'Export without payment of tax'],
  ['NSY', 'Non-supply transactions'], ['DTA', 'SEZ to DTA'],
];
const DOC_TYPE_SET = new Set(DOC_TYPES.map((d) => d[0]));
const SUPPLY_TYPE_SET = new Set(SUPPLY_TYPES.map((s) => s[0]));

// ════════════════════════════════════════════════════════════════════
// Classification: one flat row → { section, data } in the normalized model
// ════════════════════════════════════════════════════════════════════
const B2CL_THRESHOLD = 100000;

function num(r: Record<string, any>, k: string): number { return toNumber(r[k]); }
function str(r: Record<string, any>, k: string): string { return String(r[k] ?? '').trim(); }

/** combined GST rate from explicit rate columns */
function combinedRate(r: Record<string, any>): number {
  const igr = num(r, 'IntegratedTaxRate');
  if (igr > 0) return round2(igr);
  return round2(num(r, 'CentralTaxRate') + num(r, 'StateUTTaxRate'));
}
function cess(r: Record<string, any>): number { return round2(num(r, 'CessAmountAdvalorem') + num(r, 'CessAmountSpecific')); }
function amounts(r: Record<string, any>) {
  return { iamt: round2(num(r, 'IntegratedTaxAmount')), camt: round2(num(r, 'CentralTaxAmount')), samt: round2(num(r, 'StateUTTaxAmount')) };
}

export interface ClassifyResult { section: SectionKey; data: Record<string, any>; supplyClass: 'B2B' | 'B2C'; }

export function classifyRow(r: Record<string, any>, supplierStateCode: string): ClassifyResult | null {
  const doc = str(r, 'DocumentType').toUpperCase();
  const sup = str(r, 'SupplyType').toUpperCase();
  if (doc === 'CAN' || sup === 'NSY') return null; // not part of GSTR-1 liability

  const ctin = str(r, 'CustomerGSTIN').toUpperCase();
  const hasCtin = ctin.length === 15;
  const pos = posCode(r.POS);
  const inter = pos !== supplierStateCode;
  const rate = combinedRate(r);
  const taxable = round2(num(r, 'TaxableValue'));
  const a = amounts(r);
  const hsn = str(r, 'HSNorSAC');
  const common = { rate, taxableValue: taxable, cessAmount: cess(r), pos: posLabel(r.POS), ...a, ecomGstin: str(r, 'eComGSTIN'), hsn };

  // Advances
  if (doc === 'ADV') return { section: 'at', data: { pos: common.pos, rate, grossAdvance: taxable, cessAmount: common.cessAmount }, supplyClass: 'B2C' };
  if (doc === 'ADJ') return { section: 'atadj', data: { pos: common.pos, rate, grossAdvance: taxable, cessAmount: common.cessAmount }, supplyClass: 'B2C' };

  // Exports
  if (sup === 'EXPT' || sup === 'EXPWT') {
    return {
      section: 'exp', supplyClass: 'B2C',
      data: { exportType: sup === 'EXPT' ? 'WPAY' : 'WOPAY', invoiceNumber: str(r, 'DocumentNumber'), invoiceDate: toGstnDate(r.DocumentDate),
        invoiceValue: num(r, 'InvoiceValue'), portCode: str(r, 'PortCode'), shippingBillNumber: str(r, 'ShippingBillNumber'),
        shippingBillDate: toGstnDate(r.ShippingBillDate), rate, taxableValue: taxable, cessAmount: common.cessAmount, hsn },
    };
  }

  // Nil / Exempt / Non-GST
  if (sup === 'NIL' || sup === 'EXT' || sup === 'NON') {
    const desc = `${inter ? 'Inter' : 'Intra'} ${hasCtin ? 'B2B' : 'B2C'}`;
    const d: Record<string, any> = { description: desc, nilSupplies: 0, exemptedSupplies: 0, nonGstSupplies: 0 };
    if (sup === 'NIL') d.nilSupplies = taxable; else if (sup === 'EXT') d.exemptedSupplies = taxable; else d.nonGstSupplies = taxable;
    return { section: 'nil', data: d, supplyClass: hasCtin ? 'B2B' : 'B2C' };
  }

  // Credit / Debit notes
  if (doc === 'CR' || doc === 'RCR' || doc === 'DR' || doc === 'RDR') {
    const noteType = doc.includes('DR') ? 'D' : 'C';
    if (hasCtin) {
      return { section: 'cdnr', supplyClass: 'B2B',
        data: { ctin, receiverName: str(r, 'CustomerName'), noteNumber: str(r, 'DocumentNumber'), noteDate: toGstnDate(r.DocumentDate),
          origInvoiceNumber: str(r, 'OriginalDocumentNumber'), origInvoiceDate: toGstnDate(r.OriginalDocumentDate),
          noteType, pos: common.pos, reverseCharge: str(r, 'ReverseChargeFlag').toUpperCase() === 'Y' ? 'Y' : 'N',
          noteSupplyType: sup === 'SEZ' ? 'SEZ supplies with payment' : 'Regular B2B', noteValue: num(r, 'InvoiceValue'),
          rate, taxableValue: taxable, cessAmount: common.cessAmount, hsn, ...a } };
    }
    return { section: 'cdnur', supplyClass: 'B2C',
      data: { urType: inter ? 'B2CL' : 'B2CL', noteNumber: str(r, 'DocumentNumber'), noteDate: toGstnDate(r.DocumentDate),
        origInvoiceNumber: str(r, 'OriginalDocumentNumber'), origInvoiceDate: toGstnDate(r.OriginalDocumentDate),
        noteType, pos: common.pos, noteValue: num(r, 'InvoiceValue'), rate, taxableValue: taxable, cessAmount: common.cessAmount, hsn, iamt: a.iamt } };
  }

  // Invoices (INV/RNV/ANV) → B2B / B2CL / B2CS
  const invoiceCommon = { invoiceNumber: str(r, 'DocumentNumber'), invoiceDate: toGstnDate(r.DocumentDate), invoiceValue: num(r, 'InvoiceValue'), pos: common.pos };
  if (hasCtin) {
    const invoiceType = sup === 'SEZ' ? 'SEZ supplies with payment' : sup === 'DXP' ? 'Deemed Exp' : 'Regular B2B';
    return { section: 'b2b', supplyClass: 'B2B',
      data: { ctin, receiverName: str(r, 'CustomerName'), ...invoiceCommon, reverseCharge: str(r, 'ReverseChargeFlag').toUpperCase() === 'Y' ? 'Y' : 'N',
        invoiceType, ecomGstin: common.ecomGstin, rate, taxableValue: taxable, cessAmount: common.cessAmount, hsn, ...a } };
  }
  // A non-empty but non-15-char CustomerGSTIN is a data-entry error (routed to B2C).
  const partialCtin = ctin && !hasCtin ? ctin : undefined;
  // B2C: large inter-state invoices (> ₹1L) → B2CL, else B2CS rate-wise
  if (inter && num(r, 'InvoiceValue') > B2CL_THRESHOLD) {
    return { section: 'b2cl', supplyClass: 'B2C',
      data: { ...invoiceCommon, rate, taxableValue: taxable, cessAmount: common.cessAmount, ecomGstin: common.ecomGstin, hsn, partialCtin, iamt: a.iamt } };
  }
  return { section: 'b2cs', supplyClass: 'B2C',
    data: { type: common.ecomGstin ? 'E' : 'OE', pos: common.pos, rate, taxableValue: taxable, cessAmount: common.cessAmount, ecomGstin: common.ecomGstin, hsn, partialCtin, ...a } };
}

// ════════════════════════════════════════════════════════════════════
// Parse a flat workbook → normalized ParsedRecord[] (+ auto HSN summary)
// ════════════════════════════════════════════════════════════════════
export interface DocSummary {
  byType: Record<string, number>;   // distinct document numbers per DocumentType
  totalDocuments: number;
  cancelled: number;
  netDocuments: number;
}
export interface FlatParseResult { records: ParsedRecord[]; warnings: string[]; rawCount: number; supplierGstin: string; docSummary: DocSummary; }

export async function parseFlatWorkbook(buffer: Buffer): Promise<FlatParseResult | null> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  // Find the sheet whose header row contains the flat columns.
  let ws: ExcelJS.Worksheet | undefined;
  let headerMap: Record<number, string> = {};
  for (const sheet of wb.worksheets) {
    const map = matchFlatHeaders(sheet);
    if (map && Object.keys(map).length >= 6 && map.__hasCore) { ws = sheet; headerMap = map; break; }
  }
  if (!ws) return null; // not a flat file — caller falls back to multi-sheet parser

  const warnings: string[] = [];
  const flatRows: Record<string, any>[] = [];
  let headerRow = (headerMap as any).__row as number;
  let supplierGstin = '';

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const values = row.values as any[];
    const r: Record<string, any> = {};
    let any = false;
    for (const [idx, key] of Object.entries(headerMap)) {
      if (idx.startsWith('__')) continue;
      const v = cellVal(values[Number(idx)]);
      if (v !== '' && v != null) any = true;
      r[key] = v;
    }
    if (!any) return;
    if (!supplierGstin && r.SupplierGSTIN) supplierGstin = String(r.SupplierGSTIN).trim().toUpperCase();
    flatRows.push(r);
  });

  const supplierState = stateCodeFromGstin(supplierGstin);
  const records: ParsedRecord[] = [];
  let rowNo = 0;
  const hsnAgg = new Map<string, any>();

  for (const r of flatRows) {
    rowNo += 1;
    const cls = classifyRow(r, supplierState);
    if (!cls) continue;
    records.push({ section: cls.section, rowNo, data: cls.data, errors: [], isValid: true });
    accumulateHsn(hsnAgg, r, cls.supplyClass, supplierState);
  }

  // Emit auto-built HSN summary (table 12) rows.
  let hsnRow = 0;
  for (const h of hsnAgg.values()) {
    hsnRow += 1;
    records.push({ section: 'hsn', rowNo: hsnRow, data: h, errors: [], isValid: true });
  }

  if (!records.length) warnings.push('No classifiable rows found. Check DocumentType / SupplyType values.');
  if (!supplierGstin) warnings.push('SupplierGSTIN column is empty — inter/intra tax checks may be inaccurate.');

  // Document-count summary (Table 13): distinct document numbers per type.
  const seenDocs = new Map<string, Set<string>>();
  for (const r of flatRows) {
    const dt = str(r, 'DocumentType').toUpperCase() || 'INV';
    const num = str(r, 'DocumentNumber').toUpperCase();
    if (!num) continue;
    (seenDocs.get(dt) ?? seenDocs.set(dt, new Set()).get(dt)!).add(num);
  }
  const byType: Record<string, number> = {};
  let totalDocuments = 0, cancelled = 0;
  for (const [dt, set] of seenDocs) { byType[dt] = set.size; totalDocuments += set.size; if (dt === 'CAN') cancelled += set.size; }
  const docSummary: DocSummary = { byType, totalDocuments, cancelled, netDocuments: totalDocuments - cancelled };

  return { records, warnings, rawCount: flatRows.length, supplierGstin, docSummary };
}

function accumulateHsn(agg: Map<string, any>, r: Record<string, any>, supplyClass: 'B2B' | 'B2C', supplierState: string): void {
  const sup = str(r, 'SupplyType').toUpperCase();
  if (sup === 'NSY' || str(r, 'DocumentType').toUpperCase() === 'CAN') return;
  const hsn = str(r, 'HSNorSAC');
  if (!hsn) return;
  const rate = combinedRate(r);
  const key = `${supplyClass}|${hsn}|${rate}`;
  const a = amounts(r);
  const cur = agg.get(key) ?? {
    supplyType: supplyClass, hsn, description: str(r, 'ProductDescription'), uqc: str(r, 'UnitOfMeasurement') || 'OTH',
    quantity: 0, totalValue: 0, rate, taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cessAmount: 0,
  };
  cur.quantity = round2(cur.quantity + num(r, 'Quantity'));
  cur.totalValue = round2(cur.totalValue + num(r, 'InvoiceValue'));
  cur.taxableValue = round2(cur.taxableValue + num(r, 'TaxableValue'));
  cur.igst = round2(cur.igst + a.iamt);
  cur.cgst = round2(cur.cgst + a.camt);
  cur.sgst = round2(cur.sgst + a.samt);
  cur.cessAmount = round2(cur.cessAmount + cess(r));
  agg.set(key, cur);
}

function matchFlatHeaders(ws: ExcelJS.Worksheet): (Record<number, string> & { __row?: number; __hasCore?: boolean }) | null {
  let result: any = null;
  ws.eachRow((row, rowNumber) => {
    if (result) return;
    const map: Record<number, string> = {};
    (row.values as any[]).forEach((v, idx) => {
      const key = ALIAS[String(v ?? '').trim().toLowerCase()];
      if (key) map[idx] = key;
    });
    const keys = Object.values(map);
    const hasCore = keys.includes('DocumentType') && keys.includes('SupplyType') && (keys.includes('DocumentNumber') || keys.includes('TaxableValue'));
    if (hasCore) result = { ...map, __row: rowNumber, __hasCore: true };
  });
  return result;
}

function cellVal(raw: any): any {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'object') {
    if (raw instanceof Date) return raw;
    if ('text' in raw) return raw.text;
    if ('result' in raw) return raw.result;
    if ('richText' in raw) return raw.richText.map((t: any) => t.text).join('');
  }
  return raw;
}

// ════════════════════════════════════════════════════════════════════
// Friendly downloadable template (flat single sheet + Instructions + Masters)
// ════════════════════════════════════════════════════════════════════
export async function buildFlatTemplate(opts?: { gstin?: string; period?: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FylePro GST';
  wb.created = new Date(0);

  // Instructions
  const help = wb.addWorksheet('Instructions', { properties: { tabColor: { argb: 'FF4F46E5' } } });
  help.columns = [{ width: 4 }, { width: 116 }];
  const lines: [string, boolean][] = [
    ['FylePro — GSTR-1 Sales Data Template (flat format)', true],
    ['', false],
    [`SupplierGSTIN: ${opts?.gstin ?? '________________'}    ReturnPeriod (MMYYYY): ${opts?.period ?? '______'}`, false],
    ['', false],
    ['How to use:', true],
    ['1. Enter ONE row per invoice line in the "GSTR1Data" sheet (multiple rates of an invoice = multiple rows, same DocumentNumber).', false],
    ['2. Keep the header row intact. Dates as YYYY-MM-DD. Amounts as plain numbers.', false],
    ['3. DocumentType & SupplyType must use the codes in the "Masters" sheet — these classify each line into the right GSTR-1 table automatically.', false],
    ['4. CustomerGSTIN is mandatory for B2B / registered credit-debit notes; leave blank for B2C.', false],
    ['5. Enter IGST for inter-state, or CGST + SGST for intra-state (the app validates this against POS vs your state).', false],
    ['6. Upload the saved file → Validate → Reconcile → Generate portal JSON.', false],
    ['', false],
    ['Classification (handled for you):', true],
    ['   • INV + CustomerGSTIN → B2B   •  INV + no GSTIN + inter-state > ₹1L → B2CL   •  else → B2CS', false],
    ['   • CR/DR → Credit/Debit notes (registered if CustomerGSTIN present)   •  EXPT/EXPWT → Exports', false],
    ['   • NIL/EXT/NON → Nil-rated/Exempt/Non-GST   •  ADV/ADJ → Advances   •  HSN summary is auto-built', false],
  ];
  lines.forEach(([t, b], i) => { const c = help.getCell(`B${i + 1}`); c.value = t; if (b) c.font = { bold: true, size: i === 0 ? 14 : 12, color: { argb: 'FF1F2937' } }; });

  // Data sheet
  const ws = wb.addWorksheet('GSTR1Data');
  ws.columns = FLAT_COLUMNS.map((c) => ({ header: c.key, key: c.key, width: Math.max(13, Math.min(24, c.key.length + 3)) }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }; head.height = 28; head.alignment = { wrapText: true, vertical: 'middle' };
  head.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }; });
  const noteRow = ws.addRow(Object.fromEntries(FLAT_COLUMNS.map((c) => [c.key, (c.req === 'M' ? '★ ' : c.req === 'C' ? '◦ ' : '') + (c.note ?? (c.req === 'M' ? 'required' : ''))])));
  noteRow.font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Masters sheet
  const m = wb.addWorksheet('Masters');
  m.columns = [{ width: 16 }, { width: 40 }, { width: 4 }, { width: 16 }, { width: 30 }, { width: 4 }, { width: 10 }, { width: 28 }];
  writeMaster(m, 1, 'DocumentType', DOC_TYPES);
  writeMaster(m, 4, 'SupplyType', SUPPLY_TYPES);
  // States master in cols 7-8
  m.getCell(1, 7).value = 'POS / State code'; m.getCell(1, 7).font = { bold: true };
  let sr = 2;
  for (const [code, name] of Object.entries(STATE_NAMES)) { m.getCell(sr, 7).value = code; m.getCell(sr, 8).value = name; sr++; }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function writeMaster(ws: ExcelJS.Worksheet, col: number, title: string, rows: [string, string][]): void {
  const t = ws.getCell(1, col); t.value = title; t.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
  ws.getCell(1, col + 1).value = 'Description'; ws.getCell(1, col + 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getCell(1, col + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
  rows.forEach(([code, desc], i) => { ws.getCell(2 + i, col).value = code; ws.getCell(2 + i, col + 1).value = desc; });
}
