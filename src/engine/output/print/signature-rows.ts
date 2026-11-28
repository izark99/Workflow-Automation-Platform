import type { PrintSettings } from './settings';

/** Rows of blank space to sign in the signature block. */
export const SIGN_SPACE_ROWS = 4;

/** The rows of the signature block: the date line, the titles, the lines under them, the space to sign, the names. */
export function signatureRowCount(print: PrintSettings): number {
  if (print.signers.length === 0) return 0;
  const hasName = print.signers.some((s) => s.name.trim() !== '');
  return (print.dateLine.trim() === '' ? 0 : 1) + 2 + SIGN_SPACE_ROWS + (hasName ? 1 : 0);
}
