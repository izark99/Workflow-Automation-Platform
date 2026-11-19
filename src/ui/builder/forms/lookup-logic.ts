// Pure part of the Lookup / Join and Group by forms: settings in, rows out, and back.
import type { RefTable } from '../../../engine/versions';
import { translate } from '../../i18n';

export type NoMatch = 'blank' | 'drop' | 'fail';
export const NO_MATCH: NoMatch[] = ['blank', 'drop', 'fail'];

export type LookupSource = { kind: 'node' } | { kind: 'reference'; table: string };
export interface KeyPair {
  left: string;
  right: string;
}
export interface Brought {
  column: string;
  as: string;
}
export interface LookupValues {
  source: LookupSource;
  keys: KeyPair[];
  bring: Brought[];
  onNoMatch: NoMatch;
}

export function lookupFromSettings(settings: Record<string, unknown>): LookupValues {
  const src = settings.source as { kind?: unknown; table?: unknown } | undefined;
  const source: LookupSource = src?.kind === 'reference' && typeof src.table === 'string' ? { kind: 'reference', table: src.table } : { kind: 'node' };
  const keys = Array.isArray(settings.keys) ? (settings.keys as Record<string, unknown>[]).map((k) => ({ left: String(k.left ?? ''), right: String(k.right ?? '') })) : [];
  const bring = Array.isArray(settings.bring)
    ? (settings.bring as Record<string, unknown>[]).map((b) => ({ column: String(b.column ?? ''), as: typeof b.as === 'string' && b.as !== b.column ? b.as : '' }))
    : [];
  const n = settings.onNoMatch;
  return { source, keys, bring, onNoMatch: NO_MATCH.includes(n as NoMatch) ? (n as NoMatch) : 'blank' };
}

/** Only complete rows are written: a key pair needs both columns, a brought column needs its name. `as` is written when it differs. */
export function lookupToSettings(v: LookupValues, previous: Record<string, unknown>): Record<string, unknown> {
  return {
    ...previous,
    source: v.source,
    keys: v.keys.filter((k) => k.left.trim() !== '' && k.right.trim() !== '').map((k) => ({ left: k.left.trim(), right: k.right.trim() })),
    bring: v.bring
      .filter((b) => b.column.trim() !== '')
      .map((b) => (b.as.trim() !== '' && b.as.trim() !== b.column.trim() ? { column: b.column.trim(), as: b.as.trim() } : { column: b.column.trim() })),
    onNoMatch: v.onNoMatch,
  };
}

/** What is still missing, in words, for the hint under the form. Empty when the form is complete. */
export function lookupMissing(v: LookupValues, rightConnected: boolean): string[] {
  const missing: string[] = [];
  if (v.source.kind === 'node' && !rightConnected) missing.push(translate('builder.join.missing.rightInput'));
  if (!v.keys.some((k) => k.left.trim() && k.right.trim())) missing.push(translate('builder.join.missing.keyPair'));
  if (!v.bring.some((b) => b.column.trim())) missing.push(translate('builder.join.missing.bring'));
  return missing;
}

/** Column names of a reference table: those of its newest version (versions of one table share the columns). */
export function refTableColumns(tables: RefTable[], name: string): string[] | null {
  const t = tables.find((x) => x.name === name);
  if (!t || t.versions.length === 0) return null;
  const newest = [...t.versions].sort((a, b) => b.versionNo - a.versionNo)[0]!;
  return newest.columns.map((c) => c.name);
}

// ---- Group by

export type AggFn = 'sum' | 'count' | 'min' | 'max' | 'average';
export const AGG_FNS: AggFn[] = ['sum', 'count', 'min', 'max', 'average'];

export interface AggRow {
  fn: AggFn;
  column: string;
  as: string;
}
export interface GroupByValues {
  groupBy: string[];
  aggregations: AggRow[];
}

export function groupByFromSettings(settings: Record<string, unknown>): GroupByValues {
  const groupBy = Array.isArray(settings.groupBy) ? (settings.groupBy as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const aggregations = Array.isArray(settings.aggregations)
    ? (settings.aggregations as Record<string, unknown>[]).map((a) => {
        const fn = AGG_FNS.includes(a.fn as AggFn) ? (a.fn as AggFn) : 'sum';
        const column = typeof a.column === 'string' ? a.column : '';
        const def = column === '' ? fn : `${fn}_${column}`;
        return { fn, column, as: typeof a.as === 'string' && a.as !== def ? a.as : '' };
      })
    : [];
  return { groupBy, aggregations };
}

/** An aggregation is complete when it has a column, or is a count (which may count rows without a column). */
export const aggComplete = (a: AggRow): boolean => a.fn === 'count' || a.column.trim() !== '';

export function groupByToSettings(v: GroupByValues, previous: Record<string, unknown>): Record<string, unknown> {
  return {
    ...previous,
    groupBy: v.groupBy,
    aggregations: v.aggregations.filter(aggComplete).map((a) => {
      const o: Record<string, unknown> = { fn: a.fn };
      if (a.column.trim() !== '') o.column = a.column.trim();
      const def = o.column === undefined ? a.fn : `${a.fn}_${o.column as string}`;
      if (a.as.trim() !== '' && a.as.trim() !== def) o.as = a.as.trim();
      return o;
    }),
  };
}

export function groupByMissing(v: GroupByValues): string[] {
  const missing: string[] = [];
  if (v.groupBy.length === 0 && !v.aggregations.some(aggComplete)) missing.push(translate('builder.group.missing.groupOrAggregation'));
  for (const a of v.aggregations) if (!aggComplete(a)) missing.push(translate('builder.group.missing.aggregationColumn', { fn: a.fn }));
  return missing;
}

/**
 * True when the table exists but its rows are not readable by this person yet: a table is readable through a saved flow that
 * reads it (SPEC 12.1), so the columns cannot be listed until the flow is saved.
 */
export function refTableUnreadable(tables: RefTable[], name: string): boolean {
  const t = tables.find((x) => x.name === name);
  return t !== undefined && t.versions.length === 0;
}
