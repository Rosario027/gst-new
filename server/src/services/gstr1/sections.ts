import { SectionKey } from '../../types';

export type ColumnType =
  | 'string' | 'number' | 'date' | 'gstin' | 'rate' | 'pos' | 'enum';

export interface ColumnDef {
  /** Normalized field key used everywhere in the app + JSON builder. */
  key: string;
  /** Excel header — matches the official GSTN offline-tool workbook exactly. */
  header: string;
  type: ColumnType;
  required?: boolean;
  enumValues?: string[];
  /** Short helper note shown in the template. */
  note?: string;
}

export interface SectionDef {
  key: SectionKey;
  /** Worksheet/tab name in the upload template. */
  sheet: string;
  label: string;
  /** GSTR-1 table reference, e.g. "4A, 4B, 6B, 6C". */
  table: string;
  columns: ColumnDef[];
  /** Build the reconciliation match key from a normalized record. */
  matchKey: (r: Record<string, any>) => string;
  /** Whether this section carries rate-wise taxable value (for tax math). */
  hasTax: boolean;
}

const INVOICE_TYPES = ['Regular B2B', 'SEZ supplies with payment', 'SEZ supplies without payment', 'Deemed Exp', 'Intra-State supplies attracting IGST'];
const NOTE_TYPES = ['C', 'D']; // Credit / Debit
const EXPORT_TYPES = ['WPAY', 'WOPAY'];
const UR_TYPES = ['B2CL', 'EXPWP', 'EXPWOP'];
const YN = ['Y', 'N'];

function norm(s: any): string {
  return String(s ?? '').trim();
}

export const SECTIONS: SectionDef[] = [
  {
    key: 'b2b',
    sheet: 'b2b',
    label: 'B2B / SEZ / Deemed Exports',
    table: '4A, 4B, 6B, 6C',
    hasTax: true,
    columns: [
      { key: 'ctin', header: 'GSTIN/UIN of Recipient', type: 'gstin', required: true },
      { key: 'receiverName', header: 'Receiver Name', type: 'string' },
      { key: 'invoiceNumber', header: 'Invoice Number', type: 'string', required: true },
      { key: 'invoiceDate', header: 'Invoice date', type: 'date', required: true, note: 'DD-MMM-YYYY' },
      { key: 'invoiceValue', header: 'Invoice Value', type: 'number', required: true },
      { key: 'pos', header: 'Place Of Supply', type: 'pos', required: true, note: 'NN-State' },
      { key: 'reverseCharge', header: 'Reverse Charge', type: 'enum', enumValues: YN },
      { key: 'diffPercent', header: 'Applicable % of Tax Rate', type: 'number' },
      { key: 'invoiceType', header: 'Invoice Type', type: 'enum', enumValues: INVOICE_TYPES },
      { key: 'ecomGstin', header: 'E-Commerce GSTIN', type: 'string' },
      { key: 'rate', header: 'Rate', type: 'rate', required: true },
      { key: 'taxableValue', header: 'Taxable Value', type: 'number', required: true },
      { key: 'cessAmount', header: 'Cess Amount', type: 'number' },
    ],
    matchKey: (r) => `${norm(r.ctin)}|${norm(r.invoiceNumber).toUpperCase()}`,
  },
  {
    key: 'b2cl',
    sheet: 'b2cl',
    label: 'B2C Large (inter-state > ₹1L)',
    table: '5A, 5B',
    hasTax: true,
    columns: [
      { key: 'invoiceNumber', header: 'Invoice Number', type: 'string', required: true },
      { key: 'invoiceDate', header: 'Invoice date', type: 'date', required: true },
      { key: 'invoiceValue', header: 'Invoice Value', type: 'number', required: true },
      { key: 'pos', header: 'Place Of Supply', type: 'pos', required: true },
      { key: 'diffPercent', header: 'Applicable % of Tax Rate', type: 'number' },
      { key: 'rate', header: 'Rate', type: 'rate', required: true },
      { key: 'taxableValue', header: 'Taxable Value', type: 'number', required: true },
      { key: 'cessAmount', header: 'Cess Amount', type: 'number' },
      { key: 'ecomGstin', header: 'E-Commerce GSTIN', type: 'string' },
    ],
    matchKey: (r) => `${norm(r.invoiceNumber).toUpperCase()}|${norm(r.pos)}`,
  },
  {
    key: 'b2cs',
    sheet: 'b2cs',
    label: 'B2C Small (rate-wise summary)',
    table: '7',
    hasTax: true,
    columns: [
      { key: 'type', header: 'Type', type: 'enum', enumValues: ['OE', 'E'], note: 'OE=other than e-com, E=e-com' },
      { key: 'pos', header: 'Place Of Supply', type: 'pos', required: true },
      { key: 'diffPercent', header: 'Applicable % of Tax Rate', type: 'number' },
      { key: 'rate', header: 'Rate', type: 'rate', required: true },
      { key: 'taxableValue', header: 'Taxable Value', type: 'number', required: true },
      { key: 'cessAmount', header: 'Cess Amount', type: 'number' },
      { key: 'ecomGstin', header: 'E-Commerce GSTIN', type: 'string' },
    ],
    matchKey: (r) => `${norm(r.pos)}|${norm(r.rate)}|${norm(r.type) || 'OE'}`,
  },
  {
    key: 'cdnr',
    sheet: 'cdnr',
    label: 'Credit/Debit Notes (Registered)',
    table: '9B',
    hasTax: true,
    columns: [
      { key: 'ctin', header: 'GSTIN/UIN of Recipient', type: 'gstin', required: true },
      { key: 'receiverName', header: 'Receiver Name', type: 'string' },
      { key: 'noteNumber', header: 'Note Number', type: 'string', required: true },
      { key: 'noteDate', header: 'Note Date', type: 'date', required: true },
      { key: 'noteType', header: 'Note Type', type: 'enum', enumValues: NOTE_TYPES, required: true },
      { key: 'pos', header: 'Place Of Supply', type: 'pos', required: true },
      { key: 'reverseCharge', header: 'Reverse Charge', type: 'enum', enumValues: YN },
      { key: 'noteSupplyType', header: 'Note Supply Type', type: 'string' },
      { key: 'noteValue', header: 'Note Value', type: 'number', required: true },
      { key: 'diffPercent', header: 'Applicable % of Tax Rate', type: 'number' },
      { key: 'rate', header: 'Rate', type: 'rate', required: true },
      { key: 'taxableValue', header: 'Taxable Value', type: 'number', required: true },
      { key: 'cessAmount', header: 'Cess Amount', type: 'number' },
    ],
    matchKey: (r) => `${norm(r.ctin)}|${norm(r.noteNumber).toUpperCase()}`,
  },
  {
    key: 'cdnur',
    sheet: 'cdnur',
    label: 'Credit/Debit Notes (Unregistered)',
    table: '9B',
    hasTax: true,
    columns: [
      { key: 'urType', header: 'UR Type', type: 'enum', enumValues: UR_TYPES, required: true },
      { key: 'noteNumber', header: 'Note Number', type: 'string', required: true },
      { key: 'noteDate', header: 'Note Date', type: 'date', required: true },
      { key: 'noteType', header: 'Note Type', type: 'enum', enumValues: NOTE_TYPES, required: true },
      { key: 'pos', header: 'Place Of Supply', type: 'pos', required: true },
      { key: 'noteValue', header: 'Note Value', type: 'number', required: true },
      { key: 'diffPercent', header: 'Applicable % of Tax Rate', type: 'number' },
      { key: 'rate', header: 'Rate', type: 'rate', required: true },
      { key: 'taxableValue', header: 'Taxable Value', type: 'number', required: true },
      { key: 'cessAmount', header: 'Cess Amount', type: 'number' },
    ],
    matchKey: (r) => `${norm(r.urType)}|${norm(r.noteNumber).toUpperCase()}`,
  },
  {
    key: 'exp',
    sheet: 'exp',
    label: 'Exports',
    table: '6A',
    hasTax: true,
    columns: [
      { key: 'exportType', header: 'Export Type', type: 'enum', enumValues: EXPORT_TYPES, required: true, note: 'WPAY=with tax, WOPAY=without' },
      { key: 'invoiceNumber', header: 'Invoice Number', type: 'string', required: true },
      { key: 'invoiceDate', header: 'Invoice date', type: 'date', required: true },
      { key: 'invoiceValue', header: 'Invoice Value', type: 'number', required: true },
      { key: 'portCode', header: 'Port Code', type: 'string' },
      { key: 'shippingBillNumber', header: 'Shipping Bill Number', type: 'string' },
      { key: 'shippingBillDate', header: 'Shipping Bill Date', type: 'date' },
      { key: 'rate', header: 'Rate', type: 'rate', required: true },
      { key: 'taxableValue', header: 'Taxable Value', type: 'number', required: true },
      { key: 'cessAmount', header: 'Cess Amount', type: 'number' },
    ],
    matchKey: (r) => `${norm(r.invoiceNumber).toUpperCase()}`,
  },
  {
    key: 'nil',
    sheet: 'nil-exempt',
    label: 'Nil-rated / Exempt / Non-GST',
    table: '8',
    hasTax: false,
    columns: [
      { key: 'description', header: 'Description', type: 'string', required: true, note: 'Inter B2B / Intra B2B / Inter B2C / Intra B2C' },
      { key: 'nilSupplies', header: 'Nil Rated Supplies', type: 'number' },
      { key: 'exemptedSupplies', header: 'Exempted(other than nil rated/non GST supplies)', type: 'number' },
      { key: 'nonGstSupplies', header: 'Non-GST Supplies', type: 'number' },
    ],
    matchKey: (r) => `${norm(r.description)}`,
  },
  {
    key: 'hsn',
    sheet: 'hsn',
    label: 'HSN Summary',
    table: '12',
    hasTax: true,
    columns: [
      { key: 'supplyType', header: 'Supply Type', type: 'enum', enumValues: ['B2B', 'B2C'], required: true },
      { key: 'hsn', header: 'HSN', type: 'string', required: true },
      { key: 'description', header: 'Description', type: 'string' },
      { key: 'uqc', header: 'UQC', type: 'string', required: true },
      { key: 'quantity', header: 'Total Quantity', type: 'number' },
      { key: 'totalValue', header: 'Total Value', type: 'number', required: true },
      { key: 'rate', header: 'Rate', type: 'rate', required: true },
      { key: 'taxableValue', header: 'Taxable Value', type: 'number', required: true },
      { key: 'igst', header: 'Integrated Tax Amount', type: 'number' },
      { key: 'cgst', header: 'Central Tax Amount', type: 'number' },
      { key: 'sgst', header: 'State/UT Tax Amount', type: 'number' },
      { key: 'cessAmount', header: 'Cess Amount', type: 'number' },
    ],
    matchKey: (r) => `${norm(r.supplyType)}|${norm(r.hsn)}|${norm(r.rate)}`,
  },
  {
    key: 'docs',
    sheet: 'docs',
    label: 'Documents Issued',
    table: '13',
    hasTax: false,
    columns: [
      { key: 'natureOfDocument', header: 'Nature of Document', type: 'string', required: true },
      { key: 'srNoFrom', header: 'Sr. No. From', type: 'string', required: true },
      { key: 'srNoTo', header: 'Sr. No. To', type: 'string', required: true },
      { key: 'totalNumber', header: 'Total Number', type: 'number', required: true },
      { key: 'cancelled', header: 'Cancelled', type: 'number' },
    ],
    matchKey: (r) => `${norm(r.natureOfDocument)}|${norm(r.srNoFrom)}`,
  },
  {
    key: 'at',
    sheet: 'advances',
    label: 'Advances Received',
    table: '11A',
    hasTax: true,
    columns: [
      { key: 'pos', header: 'Place Of Supply', type: 'pos', required: true },
      { key: 'diffPercent', header: 'Applicable % of Tax Rate', type: 'number' },
      { key: 'rate', header: 'Rate', type: 'rate', required: true },
      { key: 'grossAdvance', header: 'Gross Advance Received', type: 'number', required: true },
      { key: 'cessAmount', header: 'Cess Amount', type: 'number' },
    ],
    matchKey: (r) => `${norm(r.pos)}|${norm(r.rate)}`,
  },
  {
    key: 'atadj',
    sheet: 'advance-adj',
    label: 'Advances Adjusted',
    table: '11B',
    hasTax: true,
    columns: [
      { key: 'pos', header: 'Place Of Supply', type: 'pos', required: true },
      { key: 'diffPercent', header: 'Applicable % of Tax Rate', type: 'number' },
      { key: 'rate', header: 'Rate', type: 'rate', required: true },
      { key: 'grossAdvance', header: 'Gross Advance Adjusted', type: 'number', required: true },
      { key: 'cessAmount', header: 'Cess Amount', type: 'number' },
    ],
    matchKey: (r) => `${norm(r.pos)}|${norm(r.rate)}`,
  },
];

export const SECTION_MAP: Record<string, SectionDef> = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s])
);

export function getSection(key: string): SectionDef | undefined {
  return SECTION_MAP[key];
}
