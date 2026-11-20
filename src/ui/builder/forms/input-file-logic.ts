import { columnNumber, columnLetters, MAX_BLANK_ROWS } from '../../../engine/input/region';
import { translate } from '../../i18n';
// Pure part of the Input file form: text in, settings out, with messages that say what to do.
export interface InputFormValues {
  key: string;
  sheet: string;
  headerRow: string;
  skipRows: string;
  fillDown: string;
  addRowNumber: boolean;
  rowNumberColumn: string;
  /** The region (SPEC 13.2). A column is a letter or a number; empty means the default. */
  firstColumn: string;
  lastColumn: string;
  stopKind: StopKind;
  blankCount: string;
  markerText: string;
  markerMatch: MarkerMatch;
  markerColumn: string;
  stopRow: string;
  ignoreRows: { column: string; text: string }[];
  expect: string[];
}

export type StopKind = 'end' | 'blank_rows' | 'marker' | 'row';
export type MarkerMatch = 'contains' | 'starts_with' | 'equals';
export const STOP_KINDS: readonly StopKind[] = ['end', 'blank_rows', 'marker', 'row'];
export const MARKER_MATCHES: readonly MarkerMatch[] = ['contains', 'starts_with', 'equals'];

export type InputFormField = keyof InputFormValues;
export type InputFormErrors = Partial<Record<InputFormField, string>>;

export const DEFAULT_ROW_NUMBER_NAME = 'row_number';

export function toFormValues(settings: Record<string, unknown>): InputFormValues {
  const num = (v: unknown, fallback: number): string => String(typeof v === 'number' ? v : fallback);
  const col = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
  const stop = (typeof settings.stopAt === 'object' && settings.stopAt !== null ? settings.stopAt : {}) as Record<string, unknown>;
  const text = (v: unknown): string => (typeof v === 'string' ? v : '');
  return {
    firstColumn: col(settings.firstColumn),
    lastColumn: col(settings.lastColumn),
    stopKind: (STOP_KINDS as readonly unknown[]).includes(stop.kind) ? (stop.kind as StopKind) : 'end',
    blankCount: String(typeof stop.count === 'number' ? stop.count : 1),
    markerText: text(stop.text),
    markerMatch: (MARKER_MATCHES as readonly unknown[]).includes(stop.match) ? (stop.match as MarkerMatch) : 'contains',
    markerColumn: text(stop.column),
    stopRow: typeof stop.row === 'number' ? String(stop.row) : '',
    ignoreRows: Array.isArray(settings.ignoreRows) ? settings.ignoreRows.map((r) => ({ column: text((r as Record<string, unknown>)?.column), text: text((r as Record<string, unknown>)?.text) })) : [],
    expect: Array.isArray(settings.expect) ? settings.expect.filter((c): c is string => typeof c === 'string') : [],
    key: typeof settings.key === 'string' ? settings.key : '',
    sheet: typeof settings.sheet === 'string' ? settings.sheet : '',
    headerRow: num(settings.headerRow, 1),
    skipRows: num(settings.skipRows, 0),
    fillDown: Array.isArray(settings.fillDown) ? settings.fillDown.join(', ') : '',
    addRowNumber: typeof settings.rowNumberColumn === 'string',
    rowNumberColumn: typeof settings.rowNumberColumn === 'string' ? settings.rowNumberColumn : DEFAULT_ROW_NUMBER_NAME,
  };
}

const wholeNumber = (text: string, min: number): number | null => {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= min ? n : null;
};

/** Column names from a comma-separated text, trimmed, without empty names and repeats. */
export function parseNameList(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(',')) {
    const name = part.trim();
    if (name) seen.add(name);
  }
  return [...seen];
}

/**
 * Checks the form. `otherKeys` are the names of the other Input file steps: two steps with one name would read the same file.
 * `previous` keeps settings that the form does not edit.
 */
export function validateInputForm(v: InputFormValues, otherKeys: string[], previous: Record<string, unknown>): { errors: InputFormErrors; settings?: Record<string, unknown> } {
  const errors: InputFormErrors = {};
  const key = v.key.trim();
  if (key === '') errors.key = translate('builder.form.input.error.keyEmpty');
  else if (otherKeys.includes(key)) errors.key = translate('builder.form.input.error.keyTaken', { key });
  const headerRow = wholeNumber(v.headerRow, 1);
  if (headerRow === null) errors.headerRow = translate('builder.form.input.error.headerRow', { value: v.headerRow });
  const skipRows = wholeNumber(v.skipRows, 0);
  if (skipRows === null) errors.skipRows = translate('builder.form.input.error.skipRows', { value: v.skipRows });
  if (v.addRowNumber && v.rowNumberColumn.trim() === '') errors.rowNumberColumn = translate('builder.form.input.error.rowNumberColumn');

  // The region.
  const first = v.firstColumn.trim() === '' ? undefined : columnNumber(v.firstColumn);
  const last = v.lastColumn.trim() === '' ? undefined : columnNumber(v.lastColumn);
  if (v.firstColumn.trim() !== '' && first === undefined) errors.firstColumn = translate('builder.form.input.error.column', { value: v.firstColumn.trim() });
  if (v.lastColumn.trim() !== '' && last === undefined) errors.lastColumn = translate('builder.form.input.error.column', { value: v.lastColumn.trim() });
  else if (last !== undefined && last < (first ?? 1)) errors.lastColumn = translate('builder.form.input.error.lastBeforeFirst', { last: v.lastColumn.trim().toUpperCase(), first: v.firstColumn.trim() === '' ? 'A' : v.firstColumn.trim().toUpperCase() });
  let stopAt: Record<string, unknown> | undefined;
  if (v.stopKind === 'blank_rows') {
    const count = wholeNumber(v.blankCount, 1);
    if (count === null || count > MAX_BLANK_ROWS) errors.blankCount = translate('builder.form.input.error.blankCount', { value: v.blankCount });
    else stopAt = { kind: 'blank_rows', count };
  } else if (v.stopKind === 'marker') {
    const text = v.markerText.trim();
    if (text === '') errors.markerText = translate('builder.form.input.error.markerText');
    else stopAt = { kind: 'marker', text, match: v.markerMatch, ...(v.markerColumn.trim() === '' ? {} : { column: v.markerColumn.trim() }) };
  } else if (v.stopKind === 'row') {
    const row = wholeNumber(v.stopRow, 1);
    if (row === null) errors.stopRow = translate('builder.form.input.error.stopRow', { value: v.stopRow });
    else stopAt = { kind: 'row', row };
  }
  const badRow = v.ignoreRows.findIndex((r) => r.column.trim() === '' || r.text.trim() === '');
  if (badRow >= 0) errors.ignoreRows = translate('builder.form.input.error.ignoreRow', { n: badRow + 1 });
  if (Object.keys(errors).length > 0) return { errors };
  const settings: Record<string, unknown> = { ...previous, key, headerRow, skipRows };
  const sheet = v.sheet.trim();
  if (sheet) settings.sheet = sheet;
  else delete settings.sheet;
  const fill = parseNameList(v.fillDown);
  if (fill.length > 0) settings.fillDown = fill;
  else delete settings.fillDown;
  if (v.addRowNumber) settings.rowNumberColumn = v.rowNumberColumn.trim();
  else delete settings.rowNumberColumn;
  // The region: a letter is written in capitals; nothing is written for a default, so an old step stays as it was.
  const write = (name: 'firstColumn' | 'lastColumn', text: string, n: number | undefined): void => {
    if (n === undefined) delete settings[name];
    else settings[name] = /^\d+$/.test(text.trim()) ? n : columnLetters(n);
  };
  write('firstColumn', v.firstColumn, first);
  write('lastColumn', v.lastColumn, last);
  if (stopAt) settings.stopAt = stopAt;
  else delete settings.stopAt;
  if (v.ignoreRows.length > 0) settings.ignoreRows = v.ignoreRows.map((r) => ({ column: r.column.trim(), text: r.text.trim() }));
  else delete settings.ignoreRows;
  if (v.expect.length > 0) settings.expect = v.expect;
  else delete settings.expect;
  return { errors, settings };
}
