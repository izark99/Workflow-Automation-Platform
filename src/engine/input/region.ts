// The region of an Input step (SPEC 13.2): which columns the table has, and where it stops. Pure helpers, no file reading.

/** The last column of a sheet: XFD, as in Excel. */
export const MAX_COLUMN = 16384;
/** The most empty rows in a row that can end a table. */
export const MAX_BLANK_ROWS = 10;

/** Where the reading stops. The default is the end of the sheet. */
export type StopRule =
  | { kind: 'end' }
  /** The first run of `count` empty rows (the whole region empty), `count` from 1 to 10. */
  | { kind: 'blank_rows'; count: number }
  /** The first row where the column (or any column) has the text. The row is not read. Not case sensitive. */
  | { kind: 'marker'; text: string; match: 'contains' | 'starts_with' | 'equals'; column?: string }
  /** A fixed last row (1-based): the rows after it are not read. */
  | { kind: 'row'; row: number };

export const STOP_MATCHES = ['contains', 'starts_with', 'equals'] as const;

/** A column as the number of the column (1-based): from a letter such as `C` (any case) or a number such as `3`. */
export function columnNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= MAX_COLUMN ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return n >= 1 && n <= MAX_COLUMN ? n : undefined;
  }
  if (!/^[A-Za-z]{1,3}$/.test(text)) return undefined;
  let n = 0;
  for (const ch of text.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n <= MAX_COLUMN ? n : undefined;
}

/** The letters of a column number: 1 is `A`, 27 is `AA`. */
export function columnLetters(n: number): string {
  let out = '';
  for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / 26)) out = String.fromCharCode(65 + ((rest - 1) % 26)) + out;
  return out;
}
