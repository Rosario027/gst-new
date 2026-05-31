import { ColumnDef, SectionDef } from './sections';
import { ValidationError } from '../../types';
import { isValidGstin } from '../gstin';
import { posCode, toNumber } from './util';

const VALID_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];

/** Validate one normalized record against its section definition. */
export function validateRecord(section: SectionDef, data: Record<string, any>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const col of section.columns) {
    const value = data[col.key];
    const present = value !== null && value !== undefined && String(value).trim() !== '';

    if (col.required && !present) {
      errors.push({ field: col.key, message: `${col.header} is required`, severity: 'error' });
      continue;
    }
    if (!present) continue;

    validateByType(col, value, errors);
  }

  // cross-field rules
  if (section.hasTax && data.taxableValue !== undefined) {
    if (toNumber(data.taxableValue) < 0) {
      errors.push({ field: 'taxableValue', message: 'Taxable value cannot be negative', severity: 'error' });
    }
  }
  if ((section.key === 'b2b' || section.key === 'cdnr') && data.invoiceValue !== undefined) {
    const inv = toNumber(data.invoiceValue ?? data.noteValue);
    const tax = toNumber(data.taxableValue);
    if (inv > 0 && tax > inv) {
      errors.push({ field: 'taxableValue', message: 'Taxable value exceeds invoice/note value', severity: 'warning' });
    }
  }
  if (section.key === 'b2cl') {
    // B2CL is inter-state large invoices; portal threshold is > ₹1,00,000 (Aug-2024 onward)
    if (toNumber(data.invoiceValue) > 0 && toNumber(data.invoiceValue) <= 100000) {
      errors.push({ field: 'invoiceValue', message: 'B2CL invoice value should exceed ₹1,00,000', severity: 'warning' });
    }
  }

  return errors;
}

function validateByType(col: ColumnDef, value: any, errors: ValidationError[]): void {
  const v = String(value).trim();
  switch (col.type) {
    case 'gstin':
      if (!isValidGstin(v)) {
        errors.push({ field: col.key, message: `Invalid GSTIN: ${v}`, severity: 'error' });
      }
      break;
    case 'number':
      if (!Number.isFinite(toNumber(v))) {
        errors.push({ field: col.key, message: `${col.header} must be a number`, severity: 'error' });
      }
      break;
    case 'rate':
      if (!VALID_RATES.includes(toNumber(v))) {
        errors.push({ field: col.key, message: `Invalid GST rate: ${v}`, severity: 'error' });
      }
      break;
    case 'pos':
      if (!posCode(v)) {
        errors.push({ field: col.key, message: `Invalid Place of Supply: ${v}`, severity: 'error' });
      }
      break;
    case 'date':
      if (!/\d/.test(v)) {
        errors.push({ field: col.key, message: `Invalid date: ${v}`, severity: 'error' });
      }
      break;
    case 'enum':
      if (col.enumValues && !col.enumValues.includes(v)) {
        errors.push({ field: col.key, message: `${col.header} must be one of: ${col.enumValues.join(', ')}`, severity: 'warning' });
      }
      break;
  }
}
