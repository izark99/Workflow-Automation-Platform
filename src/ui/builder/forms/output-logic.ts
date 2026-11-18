// Pure part of the Output, Append and SQL forms.
import { checkSqlText } from '../../../engine/nodes/sql-node';
import { translate } from '../../i18n';

export type OutputFormat = 'xlsx' | 'csv';
export interface SortRow {
  kind: 'column' | 'formula';
  column: string;
  expression: string;
  direction: 'asc' | 'desc';
}
export interface OutputValues {
  file: string;
  format: OutputFormat;
  sheet: string;
  allColumns: boolean;
  columns: string[];
  sort: SortRow[];
  numberLikeText: string[];
}

const SHEET_NAME = /^[^[\]:*?/\\]{1,31}$/;

/** The rule of the engine for an xlsx sheet name, as a message that says what to do. */
export function validateSheetName(name: string): string | undefined {
  if (name === '') return translate('builder.output.error.sheetEmpty');
  if (!SHEET_NAME.test(name) || /^'|'$/.test(name)) {
    return translate('builder.output.error.sheetInvalid');
  }
  return undefined;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function outputFromSettings(s: Record<string, unknown>): OutputValues {
  const sort = Array.isArray(s.sort)
    ? (s.sort as Record<string, unknown>[]).map((k): SortRow => ({
        kind: typeof k.expression === 'string' ? 'formula' : 'column',
        column: typeof k.column === 'string' ? k.column : '',
        expression: typeof k.expression === 'string' ? k.expression : '',
        direction: k.direction === 'desc' ? 'desc' : 'asc',
      }))
    : [];
  const columns = list(s.columns);
  return {
    file: typeof s.file === 'string' ? s.file : 'Result',
    format: s.format === 'csv' ? 'csv' : 'xlsx',
    sheet: typeof s.sheet === 'string' ? s.sheet : '',
    allColumns: !Array.isArray(s.columns),
    columns,
    sort,
    numberLikeText: list(s.numberLikeText),
  };
}

export interface OutputErrors {
  file?: string;
  sheet?: string;
}

/** Settings for the values; `settings` is missing when the file name or the sheet name is not valid (the old settings stay). */
export function outputToSettings(v: OutputValues, previous: Record<string, unknown>): { settings?: Record<string, unknown>; errors: OutputErrors } {
  const errors: OutputErrors = {};
  const file = v.file.trim();
  if (file === '') errors.file = translate('builder.output.error.fileEmpty');
  const sheet = v.sheet.trim();
  if (v.format === 'xlsx') {
    const bad = validateSheetName(sheet);
    if (bad) errors.sheet = bad;
  }
  if (errors.file || errors.sheet) return { errors };
  const out: Record<string, unknown> = { ...previous, file, format: v.format };
  if (v.format === 'xlsx') out.sheet = sheet;
  else delete out.sheet;
  if (!v.allColumns && v.columns.length > 0) out.columns = v.columns;
  else delete out.columns;
  const sort = v.sort
    .filter((k) => (k.kind === 'column' ? k.column.trim() !== '' : k.expression.trim() !== ''))
    .map((k) => {
      const o: Record<string, unknown> = k.kind === 'column' ? { column: k.column.trim() } : { expression: k.expression };
      if (k.direction === 'desc') o.direction = 'desc';
      return o;
    });
  if (sort.length > 0) out.sort = sort;
  else delete out.sort;
  if (v.numberLikeText.length > 0) out.numberLikeText = v.numberLikeText;
  else delete out.numberLikeText;
  return { settings: out, errors };
}

export function outputMissing(v: OutputValues): string[] {
  const m: string[] = [];
  if (!v.allColumns && v.columns.length === 0) m.push(translate('builder.output.missing.columns'));
  if (v.sort.some((k) => (k.kind === 'column' ? k.column.trim() === '' : k.expression.trim() === ''))) m.push(translate('builder.output.missing.sortRow'));
  return m;
}

// ---- Append
export type AppendMatch = 'name' | 'position';
export const appendFromSettings = (s: Record<string, unknown>): AppendMatch => (s.match === 'position' ? 'position' : 'name');

// ---- SQL
export type SqlCheck = { kind: 'empty' | 'refused'; message: string } | { kind: 'ok'; message: string };

/** The check that does not need data: an empty query, or one that the engine refuses (writes, files, addresses). Errors in the query itself appear in the preview. */
export function checkSql(sql: string): SqlCheck {
  if (sql.trim() === '') return { kind: 'empty', message: translate('builder.sql.state.empty') };
  const refusal = checkSqlText(sql);
  if (refusal) return { kind: 'refused', message: refusal };
  return { kind: 'ok', message: translate('builder.sql.state.ok') };
}
