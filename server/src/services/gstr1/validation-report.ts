import ExcelJS from 'exceljs';
import { ParsedRecord, ValidationSummary } from '../../types';
import { SECTION_MAP } from './sections';

/**
 * Build the downloadable validation report:
 *  - Summary sheet: overall status, totals, by-section, top issues
 *  - Issues sheet: every error/warning with row identity, field, code, message
 */
export async function buildValidationReport(opts: {
  gstin: string; period: string; filename?: string;
  records: ParsedRecord[]; validation: ValidationSummary;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FylePro GST';
  wb.created = new Date(0);
  const v = opts.validation;

  // ── Summary ──
  const s = wb.addWorksheet('Validation Summary', { properties: { tabColor: { argb: 'FF4F46E5' } } });
  s.columns = [{ width: 4 }, { width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }];
  const title = s.getCell('B1'); title.value = 'GSTR-1 Sales Data — Validation Report';
  title.font = { bold: true, size: 14, color: { argb: 'FF1F2937' } };
  s.getCell('B2').value = `GSTIN ${opts.gstin}  ·  Period ${opts.period}` + (opts.filename ? `  ·  ${opts.filename}` : '');
  s.getCell('B2').font = { color: { argb: 'FF6B7280' } };

  const statusColor = v.status === 'errors' ? 'FFC8102E' : v.status === 'warnings' ? 'FFC77700' : 'FF168736';
  const statusText = v.status === 'errors' ? 'NOT READY — errors must be fixed'
    : v.status === 'warnings' ? 'READY WITH WARNINGS — review advised' : 'CLEAN — ready to generate JSON';
  const st = s.getCell('B4'); st.value = `Status: ${statusText}`;
  st.font = { bold: true, size: 12, color: { argb: statusColor } };

  const totals: [string, number][] = [
    ['Total rows', v.totals.rows],
    ['Valid rows', v.totals.validRows],
    ['Rows with errors', v.totals.errorRows],
    ['Rows with warnings', v.totals.warningRows],
    ['Total errors', v.totals.errors],
    ['Total warnings', v.totals.warnings],
  ];
  let row = 6;
  totals.forEach(([label, val]) => { s.getCell(`B${row}`).value = label; s.getCell(`C${row}`).value = val; row++; });

  row += 1;
  s.getCell(`B${row}`).value = 'By section'; s.getCell(`B${row}`).font = { bold: true, size: 12 }; row++;
  ['Section', 'Rows', 'Errors', 'Warnings'].forEach((h, i) => headerCell(s.getCell(row, 2 + i), h)); row++;
  for (const [sec, b] of Object.entries(v.bySection)) {
    s.getCell(row, 2).value = (SECTION_MAP[sec]?.label ?? sec.toUpperCase());
    s.getCell(row, 3).value = b.rows; s.getCell(row, 4).value = b.errors; s.getCell(row, 5).value = b.warnings; row++;
  }

  row += 1;
  s.getCell(`B${row}`).value = 'Top issues'; s.getCell(`B${row}`).font = { bold: true, size: 12 }; row++;
  ['Code', 'Severity', 'Count', 'Message'].forEach((h, i) => headerCell(s.getCell(row, 2 + i), h)); row++;
  for (const it of v.topIssues) {
    s.getCell(row, 2).value = it.code;
    const sev = s.getCell(row, 3); sev.value = it.severity;
    sev.font = { color: { argb: it.severity === 'error' ? 'FFC8102E' : 'FFC77700' }, bold: true };
    s.getCell(row, 4).value = it.count;
    s.getCell(row, 5).value = it.message;
    row++;
  }

  // ── Issues detail ──
  const d = wb.addWorksheet('Issues');
  d.columns = [
    { header: 'Section', key: 'section', width: 24 },
    { header: 'Row', key: 'row', width: 7 },
    { header: 'Severity', key: 'sev', width: 11 },
    { header: 'Code', key: 'code', width: 12 },
    { header: 'Field', key: 'field', width: 18 },
    { header: 'Message', key: 'msg', width: 60 },
    { header: 'Invoice/Note', key: 'inv', width: 20 },
    { header: 'GSTIN', key: 'gstin', width: 18 },
  ];
  const dh = d.getRow(1); dh.font = { bold: true, color: { argb: 'FFFFFFFF' } }; dh.height = 22;
  dh.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }; });
  d.views = [{ state: 'frozen', ySplit: 1 }];
  d.autoFilter = 'A1:H1';

  let any = false;
  for (const r of opts.records) {
    for (const e of r.errors) {
      any = true;
      const rr = d.addRow({
        section: SECTION_MAP[r.section]?.label ?? r.section.toUpperCase(),
        row: r.rowNo, sev: e.severity, code: e.code ?? '', field: e.field, msg: e.message,
        inv: r.data.invoiceNumber ?? r.data.noteNumber ?? '',
        gstin: r.data.ctin ?? '',
      });
      rr.getCell('sev').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: e.severity === 'error' ? 'FFFBE9EC' : 'FFFEF3E2' } };
    }
  }
  if (!any) d.addRow({ section: '—', row: '', sev: '', code: '', field: '', msg: 'No issues found. Data is clean.' });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function headerCell(cell: ExcelJS.Cell, text: string): void {
  cell.value = text;
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
}
