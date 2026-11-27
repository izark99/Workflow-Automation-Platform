import { MAX_TOP_N } from '../../../engine/nodes/top-n';
import type { TopNOrder } from '../../../engine/nodes/top-n';
import { translate } from '../../i18n';

export interface TopNValues {
  /** The text of the field; it is checked when it is saved. */
  n: string;
  order: TopNOrder;
  byKind: 'column' | 'formula';
  byColumn: string;
  byExpression: string;
  groupBy: string[];
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function topNFromSettings(s: Record<string, unknown>): TopNValues {
  const by = (typeof s.by === 'object' && s.by !== null ? s.by : {}) as Record<string, unknown>;
  return {
    n: typeof s.n === 'number' ? String(s.n) : '10',
    order: s.order === 'smallest' || s.order === 'first' ? s.order : 'largest',
    byKind: typeof by.expression === 'string' ? 'formula' : 'column',
    byColumn: typeof by.column === 'string' ? by.column : '',
    byExpression: typeof by.expression === 'string' ? by.expression : '',
    groupBy: list(s.groupBy),
  };
}

/** The whole number of the field, or the message that says what to type. */
export function parseN(text: string): { n?: number; error?: string } {
  const t = text.trim().replace(/,/g, '');
  if (!/^\d+$/.test(t) || Number(t) < 1 || Number(t) > MAX_TOP_N) return { error: translate('builder.topN.error.n') };
  return { n: Number(t) };
}

/** The settings for the values, or the error of the N field (the old settings stay). */
export function topNToSettings(v: TopNValues, previous: Record<string, unknown>): { settings?: Record<string, unknown>; error?: string } {
  const n = parseN(v.n);
  if (n.n === undefined) return { error: n.error };
  const out: Record<string, unknown> = { ...previous, n: n.n, order: v.order, groupBy: v.groupBy };
  const by = v.byKind === 'column' ? (v.byColumn.trim() !== '' ? { column: v.byColumn.trim() } : undefined) : v.byExpression.trim() !== '' ? { expression: v.byExpression } : undefined;
  if (v.order !== 'first' && by) out.by = by;
  else delete out.by;
  return { settings: out };
}

/** The order needs a column or a formula and has none yet. */
export const topNMissingBy = (v: TopNValues): boolean => v.order !== 'first' && (v.byKind === 'column' ? v.byColumn.trim() === '' : v.byExpression.trim() === '');
