import ExcelJS from 'exceljs';
import { ReconLine, ReconSummary } from '../../types';
import { toNumber } from './util';

const STATUS_LABEL: Record<string, string> = {
  matched: 'Matched',
  mismatch: 'Value mismatch',
  only_in_books: 'Only in books',
  only_in_compare: 'Only in e-invoice',
};
const STATUS_FILL: Record<string, string> = {
  matched: 'FFE7F6ED',
  mismatch: 'FFFEF3E2',
  only_in_books: 'FFEAF1FE',
  only_in_compare: 'FFFBE9EC',
};

/**
 * Build the reconciliation output workbook: a Summary sheet plus a Details
 * sheet listing every line (books vs compare side-by-side) with the diff.
 */
export async function buildReconReport(opts: {
  gstin: string; period: string;
  lines: ReconLine[]; summary: ReconSummary;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FylePro GST';
  wb.created = new Date(0);

  // ── Summary ──
  const s = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF4F46E5' } } });
  s.columns = [{ width: 4 }, { width: 32 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }];
  const head = (r: number, text: string) => { const c = s.getCell(`B${r}`); c.value = text; c.font = { bold: true, size: 13, color: { argb: 'FF1F2937' } }; };
  head(1, 'GSTR-1 Reconciliation Report');
  s.getCell('B2').value = `GSTIN ${opts.gstin}  ·  Period ${opts.period}  ·  Books vs E-invoice / IRN`;
  s.getCell('B2').font = { color: { argb: 'FF6B7280' } };

  const totals = [
    ['Matched', opts.summary.matched, 'FF168736'],
    ['Value mismatch', opts.summary.mismatch, 'FFC77700'],
    ['Only in books', opts.summary.onlyInBooks, 'FF155CDB'],
    ['Only in e-invoice', opts.summary.onlyInCompare, 'FFC8102E'],
  ] as [string, number, string][];
  s.getCell('B4').value = 'Status'; s.getCell('C4').value = 'Count';
  ['B4', 'C4'].forEach((a) => { s.getCell(a).font = { bold: true, color: { argb: 'FFFFFFFF' } }; s.getCell(a).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }; });
  totals.forEach(([label, count, color], i) => {
    s.getCell(`B${5 + i}`).value = label;
    const c = s.getCell(`C${5 + i}`); c.value = count; c.font = { bold: true, color: { argb: color } };
  });

  // per-section table
  let row = 11;
  s.getCell(`B${row}`).value = 'By section';
  s.getCell(`B${row}`).font = { bold: true, size: 12 };
  row += 1;
  ['Section', 'Matched', 'Mismatch', 'Only books', 'Only e-inv'].forEach((h, i) => {
    const cell = s.getCell(row, 2 + i);
    cell.value = h; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
  });
  row += 1;
  for (const [sec, b] of Object.entries(opts.summary.bySection)) {
    s.getCell(row, 2).value = sec.toUpperCase();
    s.getCell(row, 3).value = b.matched;
    s.getCell(row, 4).value = b.mismatch;
    s.getCell(row, 5).value = b.onlyInBooks;
    s.getCell(row, 6).value = b.onlyInCompare;
    row += 1;
  }

  // ── Details ──
  const d = wb.addWorksheet('Details');
  const cols = [
    { header: 'Section', key: 'section', width: 12 },
    { header: 'Match Key', key: 'key', width: 30 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Books Taxable', key: 'bt', width: 15 },
    { header: 'E-inv Taxable', key: 'ct', width: 15 },
    { header: 'Books Rate', key: 'br', width: 11 },
    { header: 'E-inv Rate', key: 'cr', width: 11 },
    { header: 'Books POS', key: 'bp', width: 16 },
    { header: 'E-inv POS', key: 'cp', width: 16 },
    { header: 'Books Value', key: 'bv', width: 14 },
    { header: 'E-inv Value', key: 'cv', width: 14 },
    { header: 'Differences', key: 'diff', width: 40 },
  ];
  d.columns = cols;
  const dh = d.getRow(1);
  dh.font = { bold: true, color: { argb: 'FFFFFFFF' } }; dh.height = 24;
  dh.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }; });
  d.views = [{ state: 'frozen', ySplit: 1 }];
  d.autoFilter = 'A1:L1';

  const val = (o: any, k: string) => (o ? o[k] : '');
  for (const ln of opts.lines) {
    const b = ln.base, c = ln.compare;
    const diffStr = Object.keys(ln.diff || {}).map((f) => `${f}: ${fmtv(ln.diff[f].books)} → ${fmtv(ln.diff[f].compare)}`).join('; ');
    const r = d.addRow({
      section: ln.section.toUpperCase(),
      key: ln.matchKey,
      status: STATUS_LABEL[ln.status] || ln.status,
      bt: b ? toNumber(b.taxableValue) : '',
      ct: c ? toNumber(c.taxableValue) : '',
      br: b ? toNumber(b.rate) : '',
      cr: c ? toNumber(c.rate) : '',
      bp: val(b, 'pos'),
      cp: val(c, 'pos'),
      bv: b ? toNumber(b.invoiceValue ?? b.noteValue ?? 0) : '',
      cv: c ? toNumber(c.invoiceValue ?? c.noteValue ?? 0) : '',
      diff: diffStr,
    });
    const fill = STATUS_FILL[ln.status];
    if (fill) r.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function fmtv(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}
