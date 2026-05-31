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
