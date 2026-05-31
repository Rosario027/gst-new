// GSTIN validation: format + checksum (GSTN algorithm).
// Format: 2 state code + 10 PAN + 1 entity + 1 'Z' + 1 checksum.

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const CODES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function isValidGstinFormat(gstin: string): boolean {
  return typeof gstin === 'string' && GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

/** Full GSTIN check including the mod-36 checksum digit. */
export function isValidGstin(gstin: string): boolean {
  if (!gstin) return false;
  const g = gstin.trim().toUpperCase();
  if (!isValidGstinFormat(g)) return false;

  const factor = 2;
  let sum = 0;
  const mod = CODES.length; // 36
  for (let i = 0; i < 14; i++) {
    const codePoint = CODES.indexOf(g[i]);
    if (codePoint < 0) return false;
    const digit = (i % 2 === 0 ? 1 : factor) * codePoint;
    sum += Math.floor(digit / mod) + (digit % mod);
  }
  const checkCodePoint = (mod - (sum % mod)) % mod;
  return CODES[checkCodePoint] === g[14];
}

export function stateCodeFromGstin(gstin: string): string {
  return (gstin || '').slice(0, 2);
}

export function panFromGstin(gstin: string): string {
  return (gstin || '').slice(2, 12);
}
