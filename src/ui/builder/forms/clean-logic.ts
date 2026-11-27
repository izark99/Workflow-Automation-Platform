import { CASE_MODES } from '../../../engine/nodes/clean-text';
import type { CaseMode } from '../../../engine/nodes/clean-text';
import { translate } from '../../i18n';

export interface CleanValues {
  columns: string[];
  trim: boolean;
  collapse: boolean;
  nonPrinting: boolean;
  caseMode: CaseMode;
  removeMarks: boolean;
  target: 'replace' | 'suffix';
  suffix: string;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function cleanFromSettings(s: Record<string, unknown>): CleanValues {
  return {
    columns: list(s.columns),
    trim: s.trim !== false,
    collapse: s.collapse !== false,
    nonPrinting: s.nonPrinting === true,
    caseMode: (CASE_MODES as readonly unknown[]).includes(s.caseMode) ? (s.caseMode as CaseMode) : 'keep',
    removeMarks: s.removeMarks === true,
    target: s.target === 'suffix' ? 'suffix' : 'replace',
    suffix: typeof s.suffix === 'string' ? s.suffix : '_clean',
  };
}

/** The settings for the values. The suffix is kept only when the result goes to new columns. */
export function cleanToSettings(v: CleanValues, previous: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...previous, columns: v.columns, trim: v.trim, collapse: v.collapse, nonPrinting: v.nonPrinting, caseMode: v.caseMode, removeMarks: v.removeMarks, target: v.target };
  if (v.target === 'suffix') out.suffix = v.suffix;
  else delete out.suffix;
  return out;
}

/** Nothing is chosen to clean: no option and no letter case. */
export const cleanDoesNothing = (v: CleanValues): boolean => !v.trim && !v.collapse && !v.nonPrinting && !v.removeMarks && v.caseMode === 'keep';

/** What is still missing before the step can run, as messages that say what to do. */
export function cleanMissing(v: CleanValues): string[] {
  const m: string[] = [];
  if (v.columns.length === 0) m.push(translate('builder.clean.missing.columns'));
  if (cleanDoesNothing(v)) m.push(translate('builder.clean.missing.nothing'));
  if (v.target === 'suffix' && v.suffix.trim() === '') m.push(translate('builder.clean.missing.suffix'));
  return m;
}
