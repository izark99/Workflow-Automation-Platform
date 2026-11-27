import { quoteIdent } from '../sql';
import { EngineError } from '../types';
import { nullAwareTerm, requireColumn } from './columns';
import { orderTerms } from './sort';
import type { NodeModule } from './types';

export const MAX_TOP_N = 1_000_000;

export type TopNOrder = 'largest' | 'smallest' | 'first';

export interface TopNSettings {
  n: number;
  order: TopNOrder;
  /** The column or the formula that the order uses. Not read for `first`. */
  by: { column: string } | { expression: string } | undefined;
  groupBy: string[];
}

export function parseTopNSettings(raw: Record<string, unknown>, nodeId: string): TopNSettings {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Top N step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  const n = raw.n;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_TOP_N) {
    bad(`N is ${JSON.stringify(n)}, but it must be a whole number from 1 to ${MAX_TOP_N.toLocaleString('en-US')}.`);
  }
  const order = raw.order ?? 'largest';
  if (order !== 'largest' && order !== 'smallest' && order !== 'first') bad(`"order" is ${JSON.stringify(order)}; use largest, smallest or first.`);
  const groupBy = raw.groupBy ?? [];
  if (!Array.isArray(groupBy) || groupBy.some((g) => typeof g !== 'string' || g === '')) bad('"groupBy" must be a list of column names.');
  let by: TopNSettings['by'];
  const rawBy = raw.by;
  if (rawBy !== undefined && rawBy !== null) {
    if (typeof rawBy !== 'object' || Array.isArray(rawBy)) return bad('"by" must be a column or a formula.');
    const o = rawBy as Record<string, unknown>;
    if ((o.column === undefined) === (o.expression === undefined)) return bad('"by" needs either a "column" or an "expression", not both.');
    if (o.column !== undefined) {
      if (typeof o.column !== 'string' || o.column === '') return bad('"by" has an empty "column".');
      by = { column: o.column };
    } else {
      if (typeof o.expression !== 'string' || o.expression.trim() === '') return bad('"by" has an empty "expression".');
      by = { expression: o.expression };
    }
  }
  if (order !== 'first' && !by) bad(`the order "${order}" needs a column or a formula to order by. Choose one, or choose "first rows in the current order".`);
  return { n: n as number, order: order as TopNOrder, by, groupBy: groupBy as string[] };
}

/**
 * Keeps the first N rows of the table, or of each group (SPEC 15.4 item 3): the largest or smallest by a column or a formula
 * (empty values last, so they are chosen only when the group has fewer than N values), or the first rows in the current order.
 * Rows with equal values at the limit are cut by their order in the input: no ties are kept. The result is in the order of
 * the ranking within a group, groups in the order they first appear in the input.
 */
export const topNNode: NodeModule = {
  type: 'top_n',
  compile: ({ node, inputs, effectiveDate, parameters }) => {
    const input = inputs.in!;
    const s = parseTopNSettings(node.settings, node.id);
    const groups = s.groupBy.map((g) => requireColumn(input.columns, g, node.id));
    const terms: string[] = [];
    if (s.order !== 'first' && s.by) {
      const key = 'column' in s.by ? { column: s.by.column, direction: s.order === 'largest' ? ('desc' as const) : ('asc' as const) } : { expression: s.by.expression, direction: s.order === 'largest' ? ('desc' as const) : ('asc' as const) };
      terms.push(...orderTerms([key], { columns: input.columns, effectiveDate, parameters, nodeId: node.id, label: 'Top N', setting: 'by' }));
    }
    terms.push('rowid');
    const partition = groups.length > 0 ? `PARTITION BY ${groups.map(nullAwareTerm).join(', ')}` : '';
    const numbered = `SELECT *, ROW_NUMBER() OVER (${partition} ORDER BY ${terms.join(', ')}) AS __n, MIN(rowid) OVER (${partition}) AS __g FROM ${quoteIdent(input.relation)}`;
    const cols = input.columns.map((c) => quoteIdent(c.name)).join(', ');
    return { out: { sql: `SELECT ${cols} FROM (${numbered}) WHERE __n <= ${s.n} ORDER BY __g, __n`, columns: input.columns } };
  },
};
