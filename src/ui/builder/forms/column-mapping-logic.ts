// Pure part of the Column mapping form: rows as text, settings, and the paste from Excel.
export const COLUMN_TYPES = ['text', 'number', 'date', 'boolean'] as const;
export type MappingType = (typeof COLUMN_TYPES)[number];

export interface MappingRow {
  /** The column of the incoming table. */
  source: string;
  keep: boolean;
  /** The new name. Empty keeps the source name. */
  name: string;
  /** Empty keeps the type the column has. */
  type: '' | MappingType;
}

export const emptyRow = (): MappingRow => ({ source: '', keep: true, name: '', type: '' });

export function rowsFromSettings(settings: Record<string, unknown>): MappingRow[] {
  const list = Array.isArray(settings.columns) ? (settings.columns as Record<string, unknown>[]) : [];
  return list.map((c) => ({
    source: typeof c.source === 'string' ? c.source : '',
    keep: c.keep !== false,
    name: typeof c.name === 'string' && c.name !== c.source ? c.name : '',
    type: COLUMN_TYPES.includes(c.type as MappingType) ? (c.type as MappingType) : '',
  }));
}

/** Names that appear more than once among the source columns (rows without a source are ignored). */
export function duplicateSources(rows: MappingRow[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const r of rows) {
    const s = r.source.trim();
    if (!s) continue;
    if (seen.has(s)) dup.add(s);
    seen.add(s);
  }
  return [...dup];
}

/**
 * The settings for the rows: rows without a source are left out (an empty row you just added is not an error), and only what
 * differs from the default is written. A source column listed twice gives no settings, because the engine refuses it.
 */
export function settingsFromRows(rows: MappingRow[], previous: Record<string, unknown>): { settings?: Record<string, unknown>; error?: string } {
  const dup = duplicateSources(rows);
  if (dup.length > 0) return { error: `The source column "${dup[0]}" is listed more than once. Remove one of the rows.` };
  const columns = rows
    .filter((r) => r.source.trim() !== '')
    .map((r) => {
      const source = r.source.trim();
      const c: Record<string, unknown> = { source };
      if (!r.keep) c.keep = false;
      const name = r.name.trim();
      if (name && name !== source) c.name = name;
      if (r.type) c.type = r.type;
      return c;
    });
  return { settings: { ...previous, columns } };
}

const TRUE_WORDS = new Set(['', 'yes', 'y', 'true', '1', 'x', 'keep']);
const FALSE_WORDS = new Set(['no', 'n', 'false', '0', 'drop']);
const HEADER = ['column', 'source', 'source column'];

export type PasteResult = { ok: true; rows: MappingRow[] } | { ok: false; message: string };

/**
 * Reads text copied from Excel: one row per line, cells separated by tabs, in the order
 * source column, new name, type, keep. A first line that says "Column" (or "Source") is a header and is skipped.
 * One bad cell refuses the whole paste, so the grid never holds half of it.
 */
export function parsePaste(text: string): PasteResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  if (lines.length === 0) return { ok: false, message: 'There is nothing to paste. Copy the cells in Excel first, then paste again.' };
  const table = lines.map((l) => l.split('\t').map((c) => c.trim()));
  if (HEADER.includes((table[0]?.[0] ?? '').toLowerCase())) table.shift();
  if (table.length === 0) return { ok: false, message: 'The pasted text has a header row but no columns under it. Copy the rows too.' };
  const rows: MappingRow[] = [];
  for (let i = 0; i < table.length; i++) {
    const [source = '', name = '', typeText = '', keepText = ''] = table[i] as string[];
    const where = `Row ${i + 1} of the pasted text`;
    if (source === '') return { ok: false, message: `${where} has no source column in its first cell. Put the column name in the first cell, then paste again.` };
    const t = typeText.toLowerCase();
    if (t !== '' && t !== 'as is' && !COLUMN_TYPES.includes(t as MappingType)) {
      return { ok: false, message: `${where}: "${typeText}" is not a type. Use text, number, date or boolean, or leave the cell empty.` };
    }
    const k = keepText.toLowerCase();
    if (!TRUE_WORDS.has(k) && !FALSE_WORDS.has(k)) {
      return { ok: false, message: `${where}: "${keepText}" is not yes or no in the keep cell. Use yes or no, or leave the cell empty.` };
    }
    rows.push({ source, keep: !FALSE_WORDS.has(k), name: name === source ? '' : name, type: t === '' || t === 'as is' ? '' : (t as MappingType) });
  }
  const dup = duplicateSources(rows);
  if (dup.length > 0) return { ok: false, message: `The source column "${dup[0]}" appears more than once in the pasted text. Keep one row for it, then paste again.` };
  return { ok: true, rows };
}

/** True for text that has more than one cell or line, which is what a copy from Excel looks like. */
export const looksLikeGrid = (text: string): boolean => /[\t\n]/.test(text.replace(/\n+$/, ''));

/** Adds a row for each loaded column that is not in the list yet; the rows that exist keep their settings. */
export function mergeColumns(rows: MappingRow[], names: string[]): { rows: MappingRow[]; added: number } {
  const have = new Set(rows.map((r) => r.source.trim()));
  const extra = names.filter((n) => !have.has(n)).map((n) => ({ ...emptyRow(), source: n }));
  return { rows: [...rows.filter((r) => r.source.trim() !== '' || r.name || r.type), ...extra], added: extra.length };
}
