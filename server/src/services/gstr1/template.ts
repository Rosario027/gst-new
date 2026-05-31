import ExcelJS from 'exceljs';
import { SECTIONS } from './sections';

/**
 * Build the GSTR-1 reconciliation upload workbook.
 * One sheet per section with the official GSTN headers, a notes row, and
 * an instructions sheet. Users fill this in (or export from their books) and
 * upload it back for validation + reconciliation.
 */
export async function buildTemplateWorkbook(opts?: { gstin?: string; period?: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FylePro GST';
  wb.created = new Date(0); // deterministic

  // ── Instructions sheet ──
  const help = wb.addWorksheet('Instructions', { properties: { tabColor: { argb: 'FF374151' } } });
  help.columns = [{ width: 4 }, { width: 110 }];
  const lines: [string, boolean][] = [
    ['FylePro — GSTR-1 Reconciliation Upload Template', true],
    ['', false],
    [`GSTIN: ${opts?.gstin ?? '________________'}    Period (MMYYYY): ${opts?.period ?? '______'}`, false],
    ['', false],
    ['How to use:', true],
    ['1. Fill each sheet with your books / sales-register data for the period.', false],
    ['2. Keep the header row (row 1) intact — do not rename columns.', false],
    ['3. Dates as DD-MMM-YYYY (e.g. 15-May-2026). Rates as numbers (e.g. 18).', false],
    ['4. Place of Supply as "NN-State" or just the 2-digit code (e.g. 27 or 27-Maharashtra).', false],
    ['5. One row per rate. An invoice with two rates = two rows (same invoice number).', false],
    ['6. Upload the saved file back into FylePro → Validate → Reconcile → Generate JSON.', false],
    ['', false],
    ['Sheets included:', true],
    ...SECTIONS.map((s) => [`   • ${s.sheet}  —  ${s.label}  (Table ${s.table})`, false] as [string, boolean]),
  ];
  lines.forEach(([text, bold], i) => {
    const cell = help.getCell(`B${i + 1}`);
    cell.value = text;
    if (bold) cell.font = { bold: true, size: i === 0 ? 14 : 12, color: { argb: 'FF1F2937' } };
  });

  // ── One sheet per section ──
  for (const section of SECTIONS) {
    const ws = wb.addWorksheet(section.sheet);
    ws.columns = section.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.max(14, Math.min(40, c.header.length + 4)),
    }));
    // Header styling
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', wrapText: true };
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });
    // Notes row (greyed) for columns that have notes
    if (section.columns.some((c) => c.note || c.required)) {
      const noteRow = ws.addRow(
        Object.fromEntries(section.columns.map((c) => [c.key, c.required ? `* ${c.note ?? 'required'}` : c.note ?? '']))
      );
      noteRow.font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } };
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
