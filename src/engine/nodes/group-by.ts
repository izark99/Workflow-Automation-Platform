import { quoteIdent } from '../sql';
import { EngineError, type Column, type ColumnType } from '../types';
import { requireColumn } from './columns';
import type { NodeModule } from './types';

type Fn = 'sum' | 'count' | 'min' | 'max' | 'average';
const FUNCTIONS: readonly Fn[] = ['sum', 'count', 'min', 'max', 'average'];

interface Aggregation {
  fn: Fn;
  column: string | undefined;
  as: string;
}

function parse(raw: Record<string, unknown>, nodeId: string): { groupBy: string[]; aggregations: Aggregation[] } {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Group by step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  const names = (v: unknown, what: string): string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || x === '')) return bad(`"${what}" must be a list of column names.`);
    return v as string[];
  };
  const groupBy = names(raw.groupBy, 'groupBy');
  if (new Set(groupBy).size !== groupBy.length) bad('a group column appears twice.');
  if (raw.aggregations !== undefined && !Array.isArray(raw.aggregations)) bad('"aggregations" must be a list.');
  const aggregations = ((raw.aggregations as unknown[] | undefined) ?? []).map((a, i): Aggregation => {
    if (typeof a !== 'object' || a === null || Array.isArray(a)) return bad(`aggregation ${i + 1} must be an object.`);
    const o = a as Record<string, unknown>;
    if (!FUNCTIONS.includes(o.fn as Fn)) return bad(`aggregation ${i + 1} needs "fn" to be one of: ${FUNCTIONS.join(', ')}.`);
    if (o.column !== undefined && (typeof o.column !== 'string' || o.column === '')) return bad(`aggregation ${i + 1} has an empty "column".`);
    if (o.fn !== 'count' && o.column === undefined) return bad(`${o.fn as string} (aggregation ${i + 1}) needs a "column".`);
    if (o.as !== undefined && (typeof o.as !== 'string' || o.as === '')) return bad(`aggregation ${i + 1} has an empty "as" name.`);
    const column = o.column as string | undefined;
    const fn = o.fn as Fn;
    return { fn, column, as: (o.as as string | undefined) ?? (column === undefined ? fn : `${fn}_${column}`) };
  });
  if (groupBy.length === 0 && aggregations.length === 0) bad('set at least one group column or one aggregation.');
  return { groupBy, aggregations };
}

function resultType(fn: Fn, source: ColumnType | undefined): ColumnType {
  return fn === 'min' || fn === 'max' ? source! : 'number';
}

/**
 * Groups rows and aggregates them. Group keys match exactly (also text, unlike Lookup), a blank key is one group,
 * and the result is sorted by the group columns. See D23.
 */
export const groupByNode: NodeModule = {
  type: 'group_by',
  compile: ({ node, inputs }) => {
    const input = inputs.in!;
    const { groupBy, aggregations } = parse(node.settings, node.id);
    const groups = groupBy.map((name) => requireColumn(input.columns, name, node.id));

    const columns: Column[] = [...groups];
    const select = groups.map((g) => quoteIdent(g.name));
    for (const a of aggregations) {
      const src = a.column === undefined ? undefined : requireColumn(input.columns, a.column, node.id);
      if ((a.fn === 'sum' || a.fn === 'average') && src!.type !== 'number') {
        throw new EngineError(
          'invalid_settings',
          `Group by step "${node.id}": ${a.fn} needs a number column, but "${src!.name}" is ${src!.type === 'text' ? 'text' : `a ${src!.type}`}. Change its type in a Column mapping step, or use VALUE() in a Formula column step.`,
          node.id,
        );
      }
      if ((a.fn === 'min' || a.fn === 'max') && src!.type === 'boolean') {
        throw new EngineError('invalid_settings', `Group by step "${node.id}": ${a.fn} does not work on the true/false column "${src!.name}". Pick a number, date or text column.`, node.id);
      }
      const col = src === undefined ? '*' : quoteIdent(src.name);
      const expr =
        a.fn === 'sum' ? `COALESCE(sum(${col}), 0)` : a.fn === 'count' ? `CAST(count(${col}) AS DOUBLE)` : a.fn === 'average' ? `avg(${col})` : `${a.fn}(${col})`;
      select.push(`${expr} AS ${quoteIdent(a.as)}`);
      columns.push({ name: a.as, type: resultType(a.fn, src?.type) });
    }
    const seen = new Map<string, string>();
    for (const c of columns) {
      const other = seen.get(c.name.toLowerCase());
      if (other !== undefined) {
        throw new EngineError(
          'invalid_settings',
          `Group by step "${node.id}": the result would have "${other}" and "${c.name}", which are the same name (names that differ only by case count as equal). Give an aggregation a different "as" name.`,
          node.id,
        );
      }
      seen.set(c.name.toLowerCase(), c.name);
    }
    const by = groups.length > 0 ? ` GROUP BY ${groups.map((g) => quoteIdent(g.name)).join(', ')} ORDER BY ${groups.map((g) => quoteIdent(g.name)).join(', ')}` : '';
    return { out: { sql: `SELECT ${select.join(', ')} FROM ${quoteIdent(input.relation)}${by}`, columns } };
  },
};
