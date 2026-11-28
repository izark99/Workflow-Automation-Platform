// The rules that refuse a link, a publish and a delete (SPEC 16.2 items 1 and 5). They return a refusal with a code and the
// parameters of its text; the stores put the text (`src/store/messages.ts`). No React, no Supabase.
import type { Column } from '../types';

export interface LinkInfo {
  /** The id of the table that feeds this one, or null. */
  from: string;
  column: string;
  keyColumn: string;
}

export interface LinkTable {
  id: string;
  name: string;
  columns: readonly Column[];
  /** The link of this table as B, or null. */
  link: LinkInfo | null;
}

export type LinkRefusalCode = 'ref_link_self' | 'ref_link_cycle' | 'ref_link_column_missing' | 'ref_link_already_linked' | 'ref_link_key_name' | 'ref_link_key_type' | 'ref_link_publish_column' | 'ref_link_delete_source';

export interface Refusal {
  code: LinkRefusalCode;
  params: Record<string, string>;
}

/** Names are listed in code-unit order, which is the order of the `C` collation of the database: both stores say the same words. */
const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Names the tables of a cycle in the order of the chain: `B, A, B` for a link of B to A that A already feeds from B. */
export function findCycle(tables: readonly LinkTable[], bId: string, aId: string): string[] | null {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const b = byId.get(bId);
  if (!b) return null;
  // The chain of A upwards: A, the table that feeds A, and so on. A cycle exists when B is on it (or A is B).
  const path: string[] = [b.name];
  let current = byId.get(aId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    path.push(current.name);
    if (current.id === bId) return path;
    seen.add(current.id);
    current = current.link ? byId.get(current.link.from) : undefined;
  }
  return null;
}

/** The refusal of a link of B to the column `column` of A with the key column `keyColumn` in B, or null when it is allowed. */
export function linkRefusal(tables: readonly LinkTable[], bId: string, aId: string, column: string, keyColumn: string): Refusal | null {
  const b = tables.find((t) => t.id === bId);
  const a = tables.find((t) => t.id === aId);
  if (!a || !b) return null;
  if (a.id === b.id) return { code: 'ref_link_self', params: { table: b.name } };
  const cycle = findCycle(tables, bId, aId);
  if (cycle) return { code: 'ref_link_cycle', params: { tables: cycle.join(' → ') } };
  if (!a.columns.some((c) => c.name === column)) return { code: 'ref_link_column_missing', params: { table: a.name, column } };
  if (b.link) return { code: 'ref_link_already_linked', params: { table: b.name } };
  if (keyColumn.trim() === '') return { code: 'ref_link_key_name', params: { table: b.name } };
  const key = b.columns.find((c) => c.name === keyColumn.trim());
  if (key && key.type !== 'text') return { code: 'ref_link_key_type', params: { table: b.name, column: key.name } };
  return null;
}

/**
 * Publishing a version of A that lacks a linked column is refused and names the linked tables (SPEC 16.2 item 5).
 * `columns` are the columns of the version that is published; `linked` are the tables whose link is to A.
 */
export function publishRefusal(a: LinkTable, columns: readonly Column[], linked: readonly LinkTable[]): Refusal | null {
  const missing = linked.filter((t) => t.link && t.link.from === a.id && !columns.some((c) => c.name === t.link!.column));
  if (missing.length === 0) return null;
  const columnNames = [...new Set(missing.map((t) => t.link!.column))].sort(byCode);
  return { code: 'ref_link_publish_column', params: { table: a.name, columns: columnNames.join(', '), tables: missing.map((t) => t.name).sort(byCode).join(', ') } };
}

/** Deleting A while a table is linked to it is refused and names them (SPEC 16.2 item 5). */
export function deleteRefusal(a: LinkTable, tables: readonly LinkTable[]): Refusal | null {
  const linked = tables.filter((t) => t.link?.from === a.id);
  if (linked.length === 0) return null;
  return { code: 'ref_link_delete_source', params: { table: a.name, tables: linked.map((t) => t.name).sort(byCode).join(', ') } };
}
