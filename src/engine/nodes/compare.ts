import { quoteIdent } from '../sql';
import { EngineError } from '../types';
import type { Cell, Column, LoadedTable } from '../types';
import { nullAwareTerm, requireColumn } from './columns';
import type { NodeModule } from './types';

export interface CompareKey {
  /** The key column of the new table and of the old table. */
  new: string;
  old: string;
}

export interface CompareSettings {
  keys: CompareKey[];
  /** The columns to compare, by name. Empty: every column that both tables have, except the keys. */
  compare: string[];
}

export const CHANGED_COLUMNS = 'Changed columns';
export const OLD_SUFFIX = ' (old)';

export function parseCompareSettings(raw: Record<string, unknown>, nodeId: string): CompareSettings {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Compare step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  const keys = raw.keys ?? [];
  if (!Array.isArray(keys) || keys.length === 0) bad('there is no key. Choose the column that identifies a row in both tables, for example an employee id.');
  const parsed = (keys as unknown[]).map((k, i): CompareKey => {
    if (typeof k !== 'object' || k === null || Array.isArray(k)) return bad(`key ${i + 1} must have a "new" column and an "old" column.`);
    const o = k as Record<string, unknown>;
    if (typeof o.new !== 'string' || o.new === '' || typeof o.old !== 'string' || o.old === '') return bad(`key ${i + 1} needs a column of the new table and a column of the old table.`);
    return { new: o.new, old: o.old };
  });
  const compare = raw.compare ?? [];
  if (!Array.isArray(compare) || compare.some((c) => typeof c !== 'string' || c === '')) bad('"compare" must be a list of column names.');
  return { keys: parsed, compare: compare as string[] };
}

const typeName = (c: Column): string => c.type;

/** A column of one of the two tables as it is compared: an empty text counts as empty. */
const term = (c: Column, alias: 'n' | 'o'): string => (c.type === 'text' ? `NULLIF(${alias}.${quoteIdent(c.name)}, '')` : `${alias}.${quoteIdent(c.name)}`);

/** The SQL that two tables are joined on: the keys, an empty value equal to an empty value. */
const sameKey = (keys: { n: Column; o: Column }[]): string => keys.map((k) => `${term(k.n, 'n')} IS NOT DISTINCT FROM ${term(k.o, 'o')}`).join(' AND ');

const literal = (text: string): string => `'${text.replace(/'/g, "''")}'`;

/** A repeated key of one table, with how often it repeats; undefined when every key is unique. */
async function repeatedKey(
  query: (sql: string) => Promise<{ rows: unknown[][] }>,
  table: LoadedTable,
  keys: Column[],
): Promise<{ values: Cell[]; count: number } | undefined> {
  const terms = keys.map(nullAwareTerm);
  const r = await query(`SELECT ${terms.join(', ')}, count(*) AS c FROM ${quoteIdent(table.relation)} GROUP BY ${terms.map((_, i) => i + 1).join(', ')} HAVING count(*) > 1 ORDER BY min(rowid) LIMIT 1`);
  const row = r.rows[0];
  if (!row) return undefined;
  return { values: row.slice(0, keys.length) as Cell[], count: Number(row[keys.length]) };
}

const show = (v: Cell): string => (v === null ? '(empty)' : String(v));

/**
 * Compares two tables by key (SPEC 15.4 item 7). `added` holds the rows of the new table whose key the old one lacks, `removed`
 * the rows of the old table whose key the new one lacks, and `changed` the keys of both with at least one compared column
 * different: the keys, `Changed columns` (the names, joined by a comma), and for each compared column its new value and its old
 * value (`Hours` and `Hours (old)`). Values are compared as typed values; an empty value equals an empty value. A key that
 * repeats in either table stops the run and names it.
 */
export const compareNode: NodeModule = {
  type: 'compare',
  compile: async ({ node, inputs, query }) => {
    const left = inputs.new!;
    const right = inputs.old!;
    const s = parseCompareSettings(node.settings, node.id);
    const keyPairs = s.keys.map((k) => ({ n: requireColumn(left.columns, k.new, node.id), o: requireColumn(right.columns, k.old, node.id) }));
    for (const k of keyPairs) {
      if (k.n.type !== k.o.type) {
        throw new EngineError('invalid_settings', `Compare step "${node.id}": the key "${k.n.name}" is a ${typeName(k.n)} column in the new table and "${k.o.name}" is a ${typeName(k.o)} column in the old table, so the keys cannot be matched. Give both key columns the same type, for example with a Column mapping step.`, node.id);
      }
    }
    const newKeys = new Set(keyPairs.map((k) => k.n.name));
    const oldKeys = new Set(keyPairs.map((k) => k.o.name));
    // The columns to compare: the listed ones, or every column that both tables have under the same name, except the keys.
    let names = s.compare;
    if (names.length === 0) names = left.columns.filter((c) => !newKeys.has(c.name) && right.columns.some((o) => o.name === c.name && !oldKeys.has(o.name))).map((c) => c.name);
    const compared = names.map((name) => {
      if (newKeys.has(name) || oldKeys.has(name)) {
        throw new EngineError('invalid_settings', `Compare step "${node.id}": "${name}" is a key column, and key columns are not compared. Remove it from the columns to compare.`, node.id);
      }
      const n = left.columns.find((c) => c.name === name);
      const o = right.columns.find((c) => c.name === name);
      if (!n || !o) {
        throw new EngineError('unknown_column', `Compare step "${node.id}": the column "${name}" is not in the ${!n ? 'new' : 'old'} table. Only columns that both tables have can be compared.`, node.id);
      }
      if (n.type !== o.type) {
        throw new EngineError('invalid_settings', `Compare step "${node.id}": the column "${name}" is a ${typeName(n)} column in the new table and a ${typeName(o)} column in the old table, so the values cannot be compared. Give both the same type, for example with a Column mapping step.`, node.id);
      }
      return { n, o };
    });

    // A repeated key stops the run: the comparison would match one row with several.
    for (const [label, table, cols] of [['new', left, keyPairs.map((k) => k.n)], ['old', right, keyPairs.map((k) => k.o)]] as const) {
      const dup = await repeatedKey(query, table, [...cols]);
      if (dup) {
        throw new EngineError('invalid_settings', `Compare step "${node.id}": the key ${dup.values.map(show).join(' / ')} appears ${dup.count} times in the ${label} table. A key must identify one row. Remove the repeated rows (for example with Remove duplicates) and run again.`, node.id);
      }
    }

    const join = sameKey(keyPairs);
    const nTable = quoteIdent(left.relation);
    const oTable = quoteIdent(right.relation);
    const colsOf = (t: LoadedTable, alias: string): string => t.columns.map((c) => `${alias}.${quoteIdent(c.name)}`).join(', ');
    const differs = compared.map(({ n, o }) => `${term(n, 'n')} IS DISTINCT FROM ${term(o, 'o')}`);

    const added = `SELECT ${colsOf(left, 'n')} FROM ${nTable} AS n WHERE NOT EXISTS (SELECT 1 FROM ${oTable} AS o WHERE ${join}) ORDER BY n.rowid`;
    const removed = `SELECT ${colsOf(right, 'o')} FROM ${oTable} AS o WHERE NOT EXISTS (SELECT 1 FROM ${nTable} AS n WHERE ${join}) ORDER BY o.rowid`;

    const changedColumns: Column[] = [
      ...keyPairs.map((k) => k.n),
      { name: CHANGED_COLUMNS, type: 'text' as const },
      ...compared.flatMap(({ n, o }) => [n, { name: `${o.name}${OLD_SUFFIX}`, type: o.type }]),
    ];
    const seen = new Set<string>();
    for (const c of changedColumns) {
      if (seen.has(c.name)) {
        throw new EngineError('invalid_settings', `Compare step "${node.id}": the changed output would have two columns named "${c.name}". Rename one of the columns before this step.`, node.id);
      }
      seen.add(c.name);
    }
    const list = `array_to_string(list_filter([${compared.map(({ n }, i) => `CASE WHEN ${differs[i]} THEN ${literal(n.name)} END`).join(', ')}], x -> x IS NOT NULL), ', ')`;
    const select = [
      ...keyPairs.map((k) => `n.${quoteIdent(k.n.name)} AS ${quoteIdent(k.n.name)}`),
      `${list} AS ${quoteIdent(CHANGED_COLUMNS)}`,
      ...compared.flatMap(({ n, o }) => [`n.${quoteIdent(n.name)} AS ${quoteIdent(n.name)}`, `o.${quoteIdent(o.name)} AS ${quoteIdent(`${o.name}${OLD_SUFFIX}`)}`]),
    ];
    const changed = `SELECT ${select.join(', ')} FROM ${nTable} AS n JOIN ${oTable} AS o ON ${join}${differs.length > 0 ? ` WHERE ${differs.join(' OR ')}` : ' WHERE FALSE'} ORDER BY n.rowid`;
    return {
      added: { sql: added, columns: left.columns },
      removed: { sql: removed, columns: right.columns },
      changed: { sql: changed, columns: changedColumns },
    };
  },
};
