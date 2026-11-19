import type { Cell, ColumnType } from '../types';
import { MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS, GUESS_CELLS } from './types';
import type { Grid, ImportColumn, ImportProblem, RawCell } from './types';
import { coded } from '../types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;

const isBlank = (v: RawCell | undefined): boolean => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** `2026-09-30` as a real calendar date. `2026-02-30` is not. */
export function isRealIsoDate(text: string): boolean {
  const m = ISO_DATE.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** An Excel date cell is read as a UTC date: the day does not depend on the time zone of the computer. */
const isoOf = (d: Date): string => d.toISOString().slice(0, 10);

const boolOf = (text: string): boolean | null => {
  const t = text.trim().toLowerCase();
  return t === 'true' ? true : t === 'false' ? false : null;
};

/** The type that one filled cell suggests. A text cell of a csv file can still be a number, a date or true/false. */
function typeOfCell(v: RawCell, typed: boolean): ColumnType {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (v instanceof Date) return 'date';
  const text = (v as string).trim();
  if (typed) return 'text'; // a text cell of an xlsx file is text, as the file says ("007" stays "007")
  if (boolOf(text) !== null) return 'boolean';
  if (NUMBER.test(text)) return 'number';
  if (isRealIsoDate(text)) return 'date';
  return 'text';
}

/** The names of the columns from the header row: the text of each cell, trimmed. */
export function headerNames(grid: Grid, headerRow: number): string[] {
  const row = grid.rows[headerRow - 1] ?? [];
  const names = row.map((v) => (isBlank(v) ? '' : v instanceof Date ? isoOf(v) : String(v).trim()));
  // Trailing empty header cells are columns that the file does not really have.
  while (names.length > 0 && names[names.length - 1] === '') names.pop();
  return names;
}

/** Guesses the type of each column from the first 1,000 filled cells: boolean, number, date or text. All must agree. */
export function guessTypes(grid: Grid, headerRow: number, columnCount: number): ColumnType[] {
  const types: ColumnType[] = [];
  for (let c = 0; c < columnCount; c++) {
    let seen: ColumnType | null = null;
    let filled = 0;
    for (let r = headerRow; r < grid.rows.length && filled < GUESS_CELLS; r++) {
      const v = grid.rows[r]?.[c];
      if (v === undefined || isBlank(v)) continue;
      filled++;
      const t = typeOfCell(v as RawCell, grid.typed);
      if (seen === null) seen = t;
      else if (seen !== t) {
        seen = 'text';
        break;
      }
    }
    types.push(seen ?? 'text');
  }
  return types;
}

/** Problems of the column names: an empty name or a name that repeats another one without regard to case. */
export function nameProblems(names: string[]): ImportProblem[] {
  const problems: ImportProblem[] = [];
  const first = new Map<string, number>();
  names.forEach((name, i) => {
    if (name === '') {
      problems.push({ messageId: 'refimport.nameEmpty', params: { n: i + 1 } });
      return;
    }
    const key = name.toLowerCase();
    const at = first.get(key);
    if (at === undefined) first.set(key, i + 1);
    else problems.push({ messageId: 'refimport.nameRepeated', params: { name, first: at, second: i + 1 } });
  });
  return problems;
}

/** One cell as a value of its column type, or the message id of why it does not fit. */
export function convertCell(v: RawCell | undefined, type: ColumnType): { ok: true; value: Cell } | { ok: false; messageId: 'refimport.notNumber' | 'refimport.notBoolean' | 'refimport.notDate'; value: string } {
  if (v === undefined || isBlank(v)) return { ok: true, value: null };
  const shown = v instanceof Date ? isoOf(v) : String(v);
  if (type === 'text') return { ok: true, value: typeof v === 'string' ? v : v instanceof Date ? isoOf(v) : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v) };
  if (type === 'number') {
    if (typeof v === 'number') return Number.isFinite(v) ? { ok: true, value: v } : { ok: false, messageId: 'refimport.notNumber', value: shown };
    if (typeof v === 'string' && NUMBER.test(v.trim())) return { ok: true, value: Number(v.trim()) };
    return { ok: false, messageId: 'refimport.notNumber', value: shown };
  }
  if (type === 'boolean') {
    if (typeof v === 'boolean') return { ok: true, value: v };
    const b = typeof v === 'string' ? boolOf(v) : null;
    return b === null ? { ok: false, messageId: 'refimport.notBoolean', value: shown } : { ok: true, value: b };
  }
  // date
  if (v instanceof Date) return { ok: true, value: isoOf(v) };
  if (typeof v === 'string' && isRealIsoDate(v.trim())) return { ok: true, value: v.trim() };
  return { ok: false, messageId: 'refimport.notDate', value: shown };
}

export interface Converted {
  rows: Cell[][];
  /** The first problems, in file order. At most `MAX_KEPT_PROBLEMS` are kept. */
  problems: ImportProblem[];
  /** The number of cells that did not fit, including those not kept. */
  problemCount: number;
}

const MAX_KEPT_PROBLEMS = 50;

/** Converts the data rows (below the header) to the types of the columns. Row numbers in the problems are the row numbers of the sheet. */
export function convertRows(grid: Grid, headerRow: number, columns: ImportColumn[]): Converted {
  const rows: Cell[][] = [];
  const problems: ImportProblem[] = [];
  let problemCount = 0;
  for (let r = headerRow; r < grid.rows.length; r++) {
    const raw = grid.rows[r] ?? [];
    if (raw.every((v) => isBlank(v))) continue; // a row of blank cells is not a data row
    const out: Cell[] = [];
    columns.forEach((col, c) => {
      const res = convertCell(raw[c], col.type);
      if (res.ok) out.push(res.value);
      else {
        out.push(null);
        problemCount++;
        if (problems.length < MAX_KEPT_PROBLEMS) problems.push({ messageId: res.messageId, params: { row: r + 1, column: col.name, value: res.value } });
      }
    });
    rows.push(out);
  }
  return { rows, problems, problemCount };
}

export type Prepared =
  | { ok: true; columns: ImportColumn[]; rows: Cell[][] }
  | { ok: false; problems: ImportProblem[]; problemCount: number };

/**
 * Checks the whole file against SPEC 12.1 item 4 and converts it: the header row, 100 columns, 50,000 rows, the column
 * names, and every cell against its column type. Nothing is returned for a file with any problem.
 */
export function prepareImport(grid: Grid, headerRow: number, columns: ImportColumn[]): Prepared {
  const fail = (problems: ImportProblem[], count = problems.length): Prepared => ({ ok: false, problems, problemCount: count });
  if (headerRow < 1 || headerRow > grid.rows.length) return fail([{ messageId: 'refimport.noHeader', params: { row: headerRow } }]);
  if (columns.length === 0) return fail([{ messageId: 'refimport.noColumns', params: { row: headerRow } }]);
  if (columns.length > MAX_IMPORT_COLUMNS) return fail([{ messageId: 'refimport.tooManyColumns', params: { n: columns.length, max: MAX_IMPORT_COLUMNS } }]);
  const names = nameProblems(columns.map((c) => c.name.trim()));
  if (names.length > 0) return fail(names);
  const dataRows = grid.rows.length - headerRow;
  if (grid.truncated || dataRows > MAX_IMPORT_ROWS) {
    const n = grid.truncated ? `more than ${MAX_IMPORT_ROWS.toLocaleString('en-US')}` : dataRows.toLocaleString('en-US');
    return fail([{ messageId: 'refimport.tooManyRows', params: { n, max: MAX_IMPORT_ROWS.toLocaleString('en-US') } }]);
  }
  const trimmed = columns.map((c) => ({ name: c.name.trim(), type: c.type }));
  const converted = convertRows(grid, headerRow, trimmed);
  if (converted.problemCount > 0) return fail(converted.problems, converted.problemCount);
  return { ok: true, columns: trimmed, rows: converted.rows };
}

/** A thrown form of a file problem, for a caller that wants an exception. */
export function problemError(p: ImportProblem) {
  return coded('invalid_settings', p.messageId, p.params);
}
