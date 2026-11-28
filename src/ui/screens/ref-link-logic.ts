// The pure part of the link dialog of the Reference tables screen (SPEC 16.2 item 1). No React.
import { distinctValues, findCycle, keysOf, newValues, versionInEffect } from '../../engine/reflink';
import type { LinkTable } from '../../engine/reflink';
import type { Column } from '../../engine/types';
import type { RefTableView } from '../../store/types';

const latest = (t: RefTableView) => t.versions.reduce<RefTableView['versions'][number] | undefined>((best, v) => (!best || v.versionNo > best.versionNo ? v : best), undefined);

/** The columns of the latest version of a table, as the link sees them. */
export const columnsOfTable = (t: RefTableView): Column[] => latest(t)?.columns ?? [];

const asLink = (t: RefTableView): LinkTable => ({ id: t.id, name: t.name, columns: columnsOfTable(t), link: t.link ? { from: t.link.tableId, column: t.link.column, keyColumn: t.link.keyColumn } : null });

export interface Candidates {
  /** The tables that B may take values from. */
  allowed: RefTableView[];
  /** The tables that are left out because the link would make a cycle, with the chain of names. */
  cyclic: { name: string; chain: string }[];
}

/**
 * The tables that a table B may be linked to: not B itself, and not a table that would make a cycle. For a table that is being made
 * (`bId` null) every table is allowed. The tables are listed by name.
 */
export function linkCandidates(tables: readonly RefTableView[], bId: string | null): Candidates {
  const all = tables.map(asLink);
  const allowed: RefTableView[] = [];
  const cyclic: Candidates['cyclic'] = [];
  for (const t of [...tables].sort((a, b) => a.name.localeCompare(b.name))) {
    if (t.id === bId) continue;
    const chain = bId === null ? null : findCycle(all, bId, t.id);
    if (chain) cyclic.push({ name: t.name, chain: chain.join(' → ') });
    else allowed.push(t);
  }
  return { allowed, cyclic };
}

export interface LinkPreview {
  /** False when the table has no published version: its values come when one is published. */
  hasVersion: boolean;
  /** The distinct values of the column in the version of A in effect today. */
  values: string[];
  /** The ones that B does not hold yet: the rows that the link adds. */
  added: number;
}

/** What a link to the column of `a` would add to `b` today (`b` is null for a table that is being made). */
export function linkPreview(a: RefTableView, column: string, b: RefTableView | null, keyColumn: string, today: string): LinkPreview {
  const version = versionInEffect(a.versions, today);
  if (!version) return { hasVersion: false, values: [], added: 0 };
  const i = version.columns.findIndex((c) => c.name === column);
  if (i < 0) return { hasVersion: true, values: [], added: 0 };
  const values = distinctValues(version.rows.map((r) => r[i] ?? null));
  const held = b ? keysOf(b.versions, keyColumn.trim()) : new Set<string>();
  return { hasVersion: true, values, added: newValues(values, held).length };
}
