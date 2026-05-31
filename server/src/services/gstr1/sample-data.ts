import ExcelJS from 'exceljs';
import { SECTION_MAP } from './sections';

// ── Sample GSTR-1 data for the books-vs-e-invoice reconciliation demo ──
// Supplier: 27AABCT3518Q1ZV (Apex Steel, Maharashtra). Period 052026.
// The two files differ on purpose so the reco surfaces every case:
//   INV-2026-001  identical                      -> matched
//   INV-2026-002  taxable differs (1.2L vs 1.25L)-> mismatch
//   INV-2026-003  only in books (not on IRP)     -> only_in_books
//   INV-2026-004  only in e-invoice (missed)     -> only_in_compare
//   INV-2026-005  place-of-supply differs        -> mismatch
//   INV-2026-006  intra-state, identical         -> matched
// plus a matched B2CL, CDNR and Export so multiple sections reconcile.

type Rows = Record<string, Record<string, any>[]>;

const BOOKS: Rows = {
  b2b: [
    { ctin: '29AAGCB7383J1Z4', receiverName: 'Bharat Motors Pvt Ltd', invoiceNumber: 'INV-2026-001', invoiceDate: '03-May-2026', invoiceValue: 295000, pos: '29-Karnataka', reverseCharge: 'N', invoiceType: 'Regular B2B', rate: 18, taxableValue: 250000, cessAmount: 0 },
    { ctin: '24AAACC1206D1ZM', receiverName: 'Coastal Cement Co', invoiceNumber: 'INV-2026-002', invoiceDate: '07-May-2026', invoiceValue: 141600, pos: '24-Gujarat', reverseCharge: 'N', invoiceType: 'Regular B2B', rate: 18, taxableValue: 120000, cessAmount: 0 },
    { ctin: '33AABCS1681F1ZN', receiverName: 'Madras Steels', invoiceNumber: 'INV-2026-003', invoiceDate: '11-May-2026', invoiceValue: 89600, pos: '33-Tamil Nadu', reverseCharge: 'N', invoiceType: 'Regular B2B', rate: 12, taxableValue: 80000, cessAmount: 0 },
    { ctin: '06AABCA1234F1ZD', receiverName: 'Apex Distributors', invoiceNumber: 'INV-2026-005', invoiceDate: '18-May-2026', invoiceValue: 76800, pos: '06-Haryana', reverseCharge: 'N', invoiceType: 'Regular B2B', rate: 28, taxableValue: 60000, cessAmount: 0 },
    { ctin: '27AAPFU0939F1ZV', receiverName: 'Pune Fabricators', invoiceNumber: 'INV-2026-006', invoiceDate: '22-May-2026', invoiceValue: 47200, pos: '27-Maharashtra', reverseCharge: 'N', invoiceType: 'Regular B2B', rate: 18, taxableValue: 40000, cessAmount: 0 },
  ],
  b2cl: [
    { invoiceNumber: 'B2CL-2026-09', invoiceDate: '14-May-2026', invoiceValue: 212400, pos: '19-West Bengal', rate: 18, taxableValue: 180000, cessAmount: 0 },
  ],
  cdnr: [
    { ctin: '29AAGCB7383J1Z4', receiverName: 'Bharat Motors Pvt Ltd', noteNumber: 'CN-2026-01', noteDate: '20-May-2026', noteType: 'C', pos: '29-Karnataka', reverseCharge: 'N', noteValue: 23600, rate: 18, taxableValue: 20000, cessAmount: 0 },
  ],
  exp: [
    { exportType: 'WPAY', invoiceNumber: 'EXP-2026-04', invoiceDate: '09-May-2026', invoiceValue: 300000, portCode: 'INNSA1', shippingBillNumber: '7654321', shippingBillDate: '10-May-2026', rate: 18, taxableValue: 300000, cessAmount: 0 },
  ],
};

const EINVOICE: Rows = {
  b2b: [
    { ctin: '29AAGCB7383J1Z4', receiverName: 'Bharat Motors Pvt Ltd', invoiceNumber: 'INV-2026-001', invoiceDate: '03-May-2026', invoiceValue: 295000, pos: '29-Karnataka', reverseCharge: 'N', invoiceType: 'Regular B2B', rate: 18, taxableValue: 250000, cessAmount: 0 },
    // taxable differs (1.25L vs books 1.2L)
    { ctin: '24AAACC1206D1ZM', receiverName: 'Coastal Cement Co', invoiceNumber: 'INV-2026-002', invoiceDate: '07-May-2026', invoiceValue: 147500, pos: '24-Gujarat', reverseCharge: 'N', invoiceType: 'Regular B2B', rate: 18, taxableValue: 125000, cessAmount: 0 },
    // present on IRP but missing from books
    { ctin: '07AAICG9988H1ZT', receiverName: 'Delhi Trade Links', invoiceNumber: 'INV-2026-004', invoiceDate: '15-May-2026', invoiceValue: 112100, pos: '07-Delhi', reverseCharge: 'N', invoiceType: 'Regular B2B', rate: 18, taxableValue: 95000, cessAmount: 0 },
    // place of supply differs (Delhi vs books Haryana)
    { ctin: '06AABCA1234F1ZD', receiverName: 'Apex Distributors', invoiceNumber: 'INV-2026-005', invoiceDate: '18-May-2026', invoiceValue: 76800, pos: '07-Delhi', reverseCharge: 'N', invoiceType: 'Regular B2B', rate: 28, taxableValue: 60000, cessAmount: 0 },
    { ctin: '27AAPFU0939F1ZV', receiverName: 'Pune Fabricators', invoiceNumber: 'INV-2026-006', invoiceDate: '22-May-2026', invoiceValue: 47200, pos: '27-Maharashtra', reverseCharge: 'N', invoiceType: 'Regular B2B', rate: 18, taxableValue: 40000, cessAmount: 0 },
  ],
  b2cl: [
    { invoiceNumber: 'B2CL-2026-09', invoiceDate: '14-May-2026', invoiceValue: 212400, pos: '19-West Bengal', rate: 18, taxableValue: 180000, cessAmount: 0 },
  ],
  cdnr: [
    { ctin: '29AAGCB7383J1Z4', receiverName: 'Bharat Motors Pvt Ltd', noteNumber: 'CN-2026-01', noteDate: '20-May-2026', noteType: 'C', pos: '29-Karnataka', reverseCharge: 'N', noteValue: 23600, rate: 18, taxableValue: 20000, cessAmount: 0 },
  ],
  exp: [
    { exportType: 'WPAY', invoiceNumber: 'EXP-2026-04', invoiceDate: '09-May-2026', invoiceValue: 300000, portCode: 'INNSA1', shippingBillNumber: '7654321', shippingBillDate: '10-May-2026', rate: 18, taxableValue: 300000, cessAmount: 0 },
  ],
};

export type SampleKind = 'books' | 'einvoice';

export async function buildSampleWorkbook(kind: SampleKind): Promise<Buffer> {
  const data = kind === 'einvoice' ? EINVOICE : BOOKS;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FylePro GST';
  wb.created = new Date(0);

  const info = wb.addWorksheet('Sheet info', { properties: { tabColor: { argb: 'FF4F46E5' } } });
  info.columns = [{ width: 4 }, { width: 90 }];
  const title = kind === 'einvoice' ? 'SAMPLE — E-invoice / IRN data' : 'SAMPLE — Books / sales register';
  [[title, true], ['', false],
   ['GSTIN: 27AABCT3518Q1ZV   ·   Period (MMYYYY): 052026', false],
   ['Upload this in the GSTR-1 Reconciliation Workbench.', false],
   [kind === 'books' ? 'Use as the "books" file.' : 'Use as the "comparison" (e-invoice) file.', false],
   ['', false],
   ['This sample intentionally differs from its counterpart so the reconciliation', false],
   ['surfaces matched, value-mismatch, and missing-on-one-side cases.', false],
  ].forEach(([t, b], i) => {
    const c = info.getCell(`B${i + 1}`); c.value = t as string;
    if (b) c.font = { bold: true, size: i === 0 ? 13 : 12, color: { argb: 'FF1F2937' } };
  });

  for (const sectionKey of Object.keys(data)) {
    const section = SECTION_MAP[sectionKey];
    if (!section) continue;
    const ws = wb.addWorksheet(section.sheet);
    ws.columns = section.columns.map((col) => ({ header: col.header, key: col.key, width: Math.max(14, Math.min(40, col.header.length + 4)) }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.height = 26;
    head.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }; });
    for (const row of data[sectionKey]) ws.addRow(row);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
