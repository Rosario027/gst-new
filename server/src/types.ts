// Shared domain types for the GSTR-1 module.

export type SectionKey =
  | 'b2b' | 'b2cl' | 'b2cs' | 'cdnr' | 'cdnur'
  | 'exp' | 'nil' | 'hsn' | 'docs' | 'at' | 'atadj';

export interface AuthUser {
  tenantId: string;
  userId: string;
  loginId: string;
  fullName: string;
  role: string;
}

export interface ParsedRecord {
  section: SectionKey;
  rowNo: number;
  data: Record<string, any>;
  errors: ValidationError[];
  isValid: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  /** GSTN-style error code where applicable, e.g. RET191150. */
  code?: string;
}

/** Context the validator needs to enforce supplier-relative (inter/intra) rules. */
export interface ValidationContext {
  supplierGstin: string;
  supplierStateCode: string;
  period: string; // MMYYYY
}

export interface ValidationSummary {
  status: 'clean' | 'warnings' | 'errors';
  totals: {
    rows: number;
    validRows: number;
    errorRows: number;
    warningRows: number;
    errors: number;
    warnings: number;
  };
  bySection: Record<string, { rows: number; errors: number; warnings: number }>;
  byCode: Record<string, number>;
  topIssues: { code: string; message: string; count: number; severity: 'error' | 'warning' }[];
}

export interface DatasetSummary {
  totalRecords: number;
  validRecords: number;
  errorRecords: number;
  bySection: Record<string, { count: number; taxableValue: number; tax: number }>;
  totalTaxableValue: number;
  totalTax: number;
}

export type ReconStatus = 'matched' | 'mismatch' | 'only_in_books' | 'only_in_compare';

export interface ReconLine {
  section: SectionKey;
  matchKey: string;
  status: ReconStatus;
  base: Record<string, any> | null;
  compare: Record<string, any> | null;
  diff: Record<string, { books: any; compare: any }>;
}

export interface ReconSummary {
  matched: number;
  mismatch: number;
  onlyInBooks: number;
  onlyInCompare: number;
  bySection: Record<string, { matched: number; mismatch: number; onlyInBooks: number; onlyInCompare: number }>;
}
