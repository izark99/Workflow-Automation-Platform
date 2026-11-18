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
}

export type InputFormField = keyof InputFormValues;
export type InputFormErrors = Partial<Record<InputFormField, string>>;

export const DEFAULT_ROW_NUMBER_NAME = 'row_number';

export function toFormValues(settings: Record<string, unknown>): InputFormValues {
  const num = (v: unknown, fallback: number): string => String(typeof v === 'number' ? v : fallback);
  return {
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
  return { errors, settings };
}
