import { translate } from '../../i18n';

export interface CompareKeyRow {
  new: string;
  old: string;
}

export interface CompareValues {
  keys: CompareKeyRow[];
  /** Compare every column that both tables have, except the keys. */
  all: boolean;
  compare: string[];
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

export function compareFromSettings(s: Record<string, unknown>): CompareValues {
  const keys = Array.isArray(s.keys) ? (s.keys as Record<string, unknown>[]).map((k): CompareKeyRow => ({ new: text(k?.new), old: text(k?.old) })) : [];
  const compare = Array.isArray(s.compare) ? (s.compare as unknown[]).filter((c): c is string => typeof c === 'string') : [];
  return { keys, all: compare.length === 0, compare };
}

/** The settings for the values. Every key row is kept as typed. With "all columns" the list is empty. */
export function compareToSettings(v: CompareValues, previous: Record<string, unknown>): Record<string, unknown> {
  return { ...previous, keys: v.keys.map((k) => ({ new: k.new, old: k.old })), compare: v.all ? [] : v.compare };
}

/** What is still missing before the step can run, as messages that say what to do. */
export function compareMissing(v: CompareValues): string[] {
  const m: string[] = [];
  if (v.keys.length === 0) m.push(translate('builder.compare.missing.keys'));
  v.keys.forEach((k, i) => {
    if (k.new.trim() === '') m.push(translate('builder.compare.missing.keyNew', { n: i + 1 }));
    if (k.old.trim() === '') m.push(translate('builder.compare.missing.keyOld', { n: i + 1 }));
  });
  return m;
}

/**
 * The columns that can be compared, when both tables are loaded: the names that both have, except the key columns of either
 * table. Null while either table is not loaded.
 */
export function comparableColumns(v: CompareValues, newColumns: readonly string[] | null, oldColumns: readonly string[] | null): string[] | null {
  if (!newColumns || !oldColumns) return null;
  const keyNames = new Set(v.keys.flatMap((k) => [k.new, k.old]));
  return newColumns.filter((c) => oldColumns.includes(c) && !keyNames.has(c));
}
