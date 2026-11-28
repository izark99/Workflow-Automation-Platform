import { compileStepFormula } from '../formula/node-formula';
import { quoteIdent } from '../sql';
import { EngineError } from '../types';
import type { Column } from '../types';
import type { ResolvedParameters } from '../flow/parameter-values';
import { requireColumn } from './columns';
import type { NodeModule } from './types';

/** One key of a sort: a column or a formula, and a direction. */
export interface SortKey {
  column?: string;
  expression?: string;
  direction: 'asc' | 'desc';
}

/**
 * The keys of a sort, from a list of `{ column | expression, direction }` rows. The same shape as the sort of an Output step.
 * `label` says whose keys these are, for the messages ("Sort", "Top N").
 */
export function parseSortKeys(list: unknown, nodeId: string, label: string): SortKey[] {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `${label} step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  if (list === undefined) return [];
  if (!Array.isArray(list)) return bad('the sort keys must be a list.');
  return list.map((s: unknown, i: number): SortKey => {
    if (typeof s !== 'object' || s === null || Array.isArray(s)) return bad(`sort key ${i + 1} must be an object.`);
    const o = s as Record<string, unknown>;
    if ((o.column === undefined) === (o.expression === undefined)) return bad(`sort key ${i + 1} needs either a "column" or an "expression", not both.`);
    if (o.column !== undefined && (typeof o.column !== 'string' || o.column === '')) return bad(`sort key ${i + 1} has an empty "column".`);
    if (o.expression !== undefined && (typeof o.expression !== 'string' || o.expression.trim() === '')) return bad(`sort key ${i + 1} has an empty "expression".`);
    const direction = o.direction ?? 'asc';
    if (direction !== 'asc' && direction !== 'desc') return bad(`sort key ${i + 1} has "direction" ${JSON.stringify(direction)}; use asc or desc.`);
    return { ...(o.column !== undefined ? { column: o.column as string } : { expression: o.expression as string }), direction };
  });
}

/**
 * The ORDER BY terms of the keys: empty values last in both directions. The caller adds `rowid` last, so that rows with equal
 * keys keep the order of the input.
 */
export function orderTerms(
  keys: readonly SortKey[],
  ctx: { columns: Column[]; effectiveDate: string; parameters: ResolvedParameters; nodeId: string; label: string; setting: string },
): string[] {
  return keys.map((k) => {
    const expr =
      k.column !== undefined
        ? quoteIdent(requireColumn(ctx.columns, k.column, ctx.nodeId).name)
        : compileStepFormula(k.expression, { columns: ctx.columns, effectiveDate: ctx.effectiveDate, parameters: ctx.parameters }, { id: ctx.nodeId, label: ctx.label, setting: ctx.setting }).sql;
    return `${expr} ${k.direction.toUpperCase()} NULLS LAST`;
  });
}

/**
 * Puts the rows in order by the keys (SPEC 15.4 item 1). Empty values go last, rows with equal keys keep their input order,
 * and the columns and types do not change. A Sort with no key is an error, so that an unfinished step is not mistaken for a sorted one.
 */
export const sortNode: NodeModule = {
  type: 'sort',
  compile: ({ node, inputs, effectiveDate, parameters }) => {
    const input = inputs.in!;
    const keys = parseSortKeys(node.settings.keys, node.id, 'Sort');
    if (keys.length === 0) {
      throw new EngineError('invalid_settings', `Sort step "${node.id}": there is no sort key. Add a column or a formula to sort by in the step settings.`, node.id);
    }
    const order = orderTerms(keys, { columns: input.columns, effectiveDate, parameters, nodeId: node.id, label: 'Sort', setting: 'keys' });
    order.push('rowid');
    return { out: { sql: `SELECT * FROM ${quoteIdent(input.relation)} ORDER BY ${order.join(', ')}`, columns: input.columns } };
  },
};
