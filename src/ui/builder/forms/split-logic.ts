import { CUTS } from '../../../engine/nodes/split-column';
import type { Cut } from '../../../engine/nodes/split-column';
import { translate } from '../../i18n';

export interface SplitValues {
  column: string;
  cut: Cut;
  separator: string;
  names: string[];
  rest: 'last' | 'drop';
  trim: boolean;
  keepOriginal: boolean;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function splitFromSettings(s: Record<string, unknown>): SplitValues {
  return {
    column: typeof s.column === 'string' ? s.column : '',
    cut: (CUTS as readonly unknown[]).includes(s.cut) ? (s.cut as Cut) : 'space',
    separator: typeof s.separator === 'string' ? s.separator : '',
    names: list(s.names),
    rest: s.rest === 'drop' ? 'drop' : 'last',
    trim: s.trim !== false,
    keepOriginal: s.keepOriginal === true,
  };
}

/** The settings for the values. The separator is kept only for the cut at a given text. */
export function splitToSettings(v: SplitValues, previous: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...previous, column: v.column.trim(), cut: v.cut, names: v.names, rest: v.rest, trim: v.trim, keepOriginal: v.keepOriginal };
  if (v.cut === 'text') out.separator = v.separator;
  else delete out.separator;
  return out;
}

/** What is still missing before the step can run, as messages that say what to do. */
export function splitMissing(v: SplitValues): string[] {
  const m: string[] = [];
  if (v.column.trim() === '') m.push(translate('builder.split.missing.column'));
  if (v.cut === 'text' && v.separator === '') m.push(translate('builder.split.missing.separator'));
  if (v.names.length === 0) m.push(translate('builder.split.missing.names'));
  return m;
}

/**
 * The new names that another column of the input already has, when the columns are known. The name of the original column is
 * free when it is not kept: the new column takes its place.
 */
export function nameClashes(v: SplitValues, columns: readonly string[] | null): string[] {
  if (!columns) return [];
  const taken = new Set(columns.filter((c) => v.keepOriginal || c !== v.column));
  return v.names.filter((n) => taken.has(n));
}
