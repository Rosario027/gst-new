import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { SECTIONS, SectionDef, ColumnDef } from './sections';
import { DatasetSummary, ParsedRecord } from '../../types';
import { toNumber, posLabel } from './util';

export interface ParseResult {
  records: ParsedRecord[];
  summary: DatasetSummary;
  warnings: string[];
}

/** Parse an uploaded workbook buffer into normalized, validated records. */
export async function parseWorkbook(buffer: Buffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);

  const records: ParsedRecord[] = [];
  const warnings: string[] = [];

  for (const section of SECTIONS) {
    const ws = findSheet(wb, section);
    if (!ws) continue;
    parseSheet(ws, section, records, warnings);
  }

  if (records.length === 0) {
    warnings.push('No data rows found in any recognized sheet. Check the headers match the template.');
  }

  return { records, summary: summarize(records), warnings };
}

/** Parse a single CSV buffer for one explicit section (used for CSV uploads). */
export async function parseCsv(buffer: Buffer, sectionKey: string): Promise<ParseResult> {
  const section = SECTIONS.find((s) => s.key === sectionKey);
  if (!section) throw new Error(`Unknown section: ${sectionKey}`);
  const wb = new ExcelJS.Workbook();
  const ws = await wb.csv.read(bufferToStream(buffer)) as unknown as ExcelJS.Worksheet;
  const records: ParsedRecord[] = [];
  const warnings: string[] = [];
  parseSheet(ws, section, records, warnings);
  return { records, summary: summarize(records), warnings };
}

function findSheet(wb: ExcelJS.Workbook, section: SectionDef): ExcelJS.Worksheet | undefined {
  // match by exact sheet name, then by alias (official tool names like "b2b,sez,de", "exemp")
  const aliases: Record<string, string[]> = {
    b2b: ['b2b', 'b2b,sez,de', 'b2b sez de'],
    nil: ['nil-exempt', 'nil', 'exemp', 'nil rated'],
    hsn: ['hsn', 'hsn(b2b)', 'hsn(b2c)', 'hsn summary'],
    at: ['advances', 'at', 'advance received'],
    atadj: ['advance-adj', 'atadj', 'advance adjusted'],
  };
  const names = (aliases[section.key] ?? [section.sheet, section.key]).map((n) => n.toLowerCase());
  return wb.worksheets.find((w) => names.includes(w.name.trim().toLowerCase()));
}

function parseSheet(ws: ExcelJS.Worksheet, section: SectionDef, out: ParsedRecord[], warnings: string[]): void {
  // Build a header->columnIndex map from the first non-empty row.
  let headerRowIdx = 0;
  let headerMap: Record<number, ColumnDef> = {};
  ws.eachRow((row, rowNumber) => {
    if (headerRowIdx) return;
    const cells = (row.values as any[]).map((c) => String(c ?? '').trim().toLowerCase());
    const matched = matchHeaders(cells, section);
    if (Object.keys(matched).length >= Math.min(2, section.columns.length)) {
      headerRowIdx = rowNumber;
      headerMap = matched;
    }
  });

  if (!headerRowIdx) {
    warnings.push(`Sheet "${ws.name}": could not locate a header row matching ${section.label}.`);
    return;
  }

  let dataRowNo = 0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIdx) return;
    const values = row.values as any[];
    const data: Record<string, any> = {};
    let hasAny = false;
    for (const [idxStr, col] of Object.entries(headerMap)) {
      const raw = values[Number(idxStr)];
      const val = cellValue(raw);
      if (val !== '' && val !== null && val !== undefined) hasAny = true;
      data[col.key] = normalizeValue(col, val);
    }
    // skip the italic note row & empty rows
    if (!hasAny) return;
    if (isNoteRow(data, section)) return;

    dataRowNo += 1;
    // Validation is applied later by validateDataset() once the supplier
    // context (GSTIN/state/period) is known, so it can enforce inter/intra rules.
    out.push({ section: section.key, rowNo: dataRowNo, data, errors: [], isValid: true });
  });
}

function matchHeaders(cells: string[], section: SectionDef): Record<number, ColumnDef> {
  const map: Record<number, ColumnDef> = {};
  cells.forEach((cell, idx) => {
    if (!cell) return;
    const col = section.columns.find(
      (c) => c.header.toLowerCase() === cell || c.key.toLowerCase() === cell
    );
    if (col) map[idx] = col;
  });
  return map;
}

function cellValue(raw: any): any {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'object') {
    if (raw instanceof Date) return raw;
    if ('text' in raw) return raw.text; // rich text / hyperlink
    if ('result' in raw) return raw.result; // formula
    if ('richText' in raw) return raw.richText.map((t: any) => t.text).join('');
  }
  return raw;
}

function normalizeValue(col: ColumnDef, val: any): any {
  if (val === '' || val === null || val === undefined) return col.type === 'number' || col.type === 'rate' ? 0 : '';
  if (col.type === 'number' || col.type === 'rate') return toNumber(val);
  if (col.type === 'pos') return posLabel(val);
  if (col.type === 'gstin') return String(val).trim().toUpperCase();
  return typeof val === 'string' ? val.trim() : val;
}

function isNoteRow(data: Record<string, any>, section: SectionDef): boolean {
  // template note row starts cells with "*" or contains "required"/"DD-"
  const vals = section.columns.map((c) => String(data[c.key] ?? ''));
  return vals.some((v) => v.startsWith('*')) && vals.every((v) => v === '' || v.startsWith('*') || /required|DD-|NN-|OE=|WPAY=/.test(v));
}

export function summarizeRecords(records: ParsedRecord[]): DatasetSummary {
  return summarize(records);
}

function summarize(records: ParsedRecord[]): DatasetSummary {
  const bySection: DatasetSummary['bySection'] = {};
  let totalTaxableValue = 0;
  let totalTax = 0;
  let validRecords = 0;

  for (const r of records) {
    const sec = (bySection[r.section] ??= { count: 0, taxableValue: 0, tax: 0 });
    sec.count += 1;
    const taxable = toNumber(r.data.taxableValue);
    const tax = (taxable * toNumber(r.data.rate)) / 100;
    sec.taxableValue += taxable;
    sec.tax += tax;
    totalTaxableValue += taxable;
    totalTax += tax;
    if (r.isValid) validRecords += 1;
  }

  return {
    totalRecords: records.length,
    validRecords,
    errorRecords: records.length - validRecords,
    bySection,
    totalTaxableValue: Math.round(totalTaxableValue * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
  };
}

function bufferToStream(buffer: Buffer): Readable {
  return Readable.from(buffer);
}
