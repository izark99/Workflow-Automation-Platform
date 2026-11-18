import { toText } from '../formula/ops';
import { quoteIdent, quoteString } from '../sql';
import { EngineError, type Column, type ColumnType } from '../types';
import { requireColumn } from './columns';
import type { CompileContext, NodeModule } from './types';

type Fn = 'sum' | 'count' | 'min' | 'max' | 'average';
const FUNCTIONS: readonly Fn[] = ['sum', 'count', 'min', 'max', 'average'];
const MAX_COLUMNS = 500;

interface Settings {
  rowKeys: string[];
  columnSource: string;
  value: string | undefined;
  aggregation: Fn;
  columns: { from: 'data' } | { from: 'reference'; table: string; column: string };
  fill: number | null | undefined;
  namePrefix: string;
  nameSuffix: string;
  nameCase: 'keep' | 'lower' | 'upper';
}

function parse(raw: Record<string, unknown>, nodeId: string): Settings {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Pivot step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  const name = (v: unknown, what: string): string => (typeof v === 'string' && v !== '' ? v : bad(`"${what}" must be a column name.`));
  if (raw.rowKeys !== undefined && (!Array.isArray(raw.rowKeys) || raw.rowKeys.some((k) => typeof k !== 'string' || k === ''))) {
    bad('"rowKeys" must be a list of column names.');
  }
  const rowKeys = (raw.rowKeys as string[] | undefined) ?? [];
  if (!FUNCTIONS.includes(raw.aggregation as Fn)) bad(`"aggregation" must be one of: ${FUNCTIONS.join(', ')}.`);
  const aggregation = raw.aggregation as Fn;
  const value = raw.value === undefined ? undefined : name(raw.value, 'value');
  if (aggregation !== 'count' && value === undefined) bad(`${aggregation} needs a "value" column.`);

  const c = raw.columns ?? { from: 'data' };
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return bad('"columns" must say where the new columns come from.');
  const co = c as Record<string, unknown>;
  let columns: Settings['columns'];
  if (co.from === 'data') columns = { from: 'data' };
  else if (co.from === 'reference') columns = { from: 'reference', table: name(co.table, 'columns.table'), column: name(co.column, 'columns.column') };
  else return bad('"columns.from" must be "data" or "reference".');

  if (raw.fill !== undefined && raw.fill !== null && typeof raw.fill !== 'number') bad('"fill" must be a number or null.');
  const nameCase = raw.nameCase ?? 'keep';
  if (nameCase !== 'keep' && nameCase !== 'lower' && nameCase !== 'upper') bad('"nameCase" must be keep, lower or upper.');
  for (const k of ['namePrefix', 'nameSuffix']) {
    if (raw[k] !== undefined && typeof raw[k] !== 'string') bad(`"${k}" must be text.`);
  }
  return {
    rowKeys,
    columnSource: name(raw.columnSource, 'columnSource'),
    value,
    aggregation,
    columns,
    fill: raw.fill as number | null | undefined,
    namePrefix: (raw.namePrefix as string | undefined) ?? '',
    nameSuffix: (raw.nameSuffix as string | undefined) ?? '',
    nameCase: nameCase as Settings['nameCase'],
  };
}

async function newColumnValues(ctx: CompileContext, s: Settings, sourceSql: string, relation: string): Promise<string[]> {
  const { node } = ctx;
  let sql: string;
  if (s.columns.from === 'reference') {
    const ref = ctx.refTables[s.columns.table];
    if (!ref) {
      throw new EngineError(
        'missing_reference_table',
        `Pivot step "${node.id}": the reference table "${s.columns.table}" is not available for this run (effective date ${ctx.effectiveDate}). Check the table name, and that one of its versions covers that date.`,
        node.id,
      );
    }
    const col = requireColumn(ref.columns, s.columns.column, node.id);
    const text = toText({ sql: quoteIdent(col.name), type: col.type });
    // The order of first appearance in the table, each value once.
    sql = `SELECT ${text} AS v FROM ${quoteIdent(ref.relation)} WHERE ${text} IS NOT NULL GROUP BY ${text} ORDER BY min(rowid)`;
  } else {
    sql = `SELECT DISTINCT ${sourceSql} AS v FROM ${quoteIdent(relation)} WHERE ${sourceSql} IS NOT NULL ORDER BY v`;
  }
  const values = (await ctx.query(sql)).rows.map((r) => String(r[0]));
  if (values.length > MAX_COLUMNS) {
    throw new EngineError(
      'invalid_settings',
      `Pivot step "${node.id}" would make ${values.length} columns, and ${MAX_COLUMNS} is the most. Add a Filter step before it, or take the column list from a reference table.`,
      node.id,
    );
  }
  return values;
}

/**
 * Turns the values of one column into columns. The list of columns comes from the data (sorted) or from a
 * reference table (its order), so a fixed list gives the same header for every dataset; data values that are not in
 * that list are left out. Missing combinations are 0 for sum and count, else blank, or the `fill` value. See D25.
 */
export const pivotNode: NodeModule = {
  type: 'pivot',
  compile: async (ctx) => {
    const { node } = ctx;
    const input = ctx.inputs.in!;
    const s = parse(node.settings, node.id);
    const keys = s.rowKeys.map((k) => requireColumn(input.columns, k, node.id));
    const source = requireColumn(input.columns, s.columnSource, node.id);
    const value = s.value === undefined ? undefined : requireColumn(input.columns, s.value, node.id);
    if (keys.some((k) => k.name === source.name)) {
      throw new EngineError('invalid_settings', `Pivot step "${node.id}": "${source.name}" cannot be both a row key and the column source. Remove it from the row keys.`, node.id);
    }
    if (value) {
      const t: ColumnType = value.type;
      const bad = (s.aggregation === 'sum' || s.aggregation === 'average') ? t !== 'number' : (s.aggregation === 'min' || s.aggregation === 'max') ? t === 'boolean' : false;
      if (bad) {
        throw new EngineError('invalid_settings', `Pivot step "${node.id}": ${s.aggregation} does not work on the ${t} column "${value.name}". ${s.aggregation === 'min' || s.aggregation === 'max' ? 'Pick a number, date or text column.' : 'Change its type to number in a Column mapping step.'}`, node.id);
      }
    }
    const resultType: ColumnType = (s.aggregation === 'min' || s.aggregation === 'max') && value ? value.type : 'number';
    if (typeof s.fill === 'number' && resultType !== 'number') {
      throw new EngineError('invalid_settings', `Pivot step "${node.id}": "fill" is a number, but the result is a ${resultType}. Remove "fill" or pick a number value.`, node.id);
    }

    const sourceText = toText({ sql: quoteIdent(source.name), type: source.type });
    const values = await newColumnValues(ctx, s, sourceText, input.relation);

    const apply = (v: string) => (s.nameCase === 'lower' ? v.toLowerCase() : s.nameCase === 'upper' ? v.toUpperCase() : v);
    const taken = new Map(keys.map((k) => [k.name.toLowerCase(), k.name]));
    const newColumns: Column[] = [];
    const select = keys.map((k) => quoteIdent(k.name));
    const defaultFill = s.aggregation === 'sum' ? 0 : null;
    const fill = s.fill === undefined ? defaultFill : s.fill;
    for (const v of values) {
      const outName = `${s.namePrefix}${apply(v)}${s.nameSuffix}`;
      const clash = taken.get(outName.toLowerCase());
      if (clash !== undefined) {
        throw new EngineError(
          'invalid_settings',
          `Pivot step "${node.id}": the value "${v}" would make a column "${outName}", which has the same name as "${clash}" (names that differ only by case count as equal). Change the name settings, or rename a key column.`,
          node.id,
        );
      }
      taken.set(outName.toLowerCase(), outName);
      const hit = `${sourceText} = ${quoteString(v)}`;
      const cell = value ? `CASE WHEN ${hit} THEN ${quoteIdent(value.name)} END` : `CASE WHEN ${hit} THEN 1 END`;
      const agg =
        s.aggregation === 'count'
          ? `CAST(count(${cell}) AS DOUBLE)`
          : s.aggregation === 'average'
            ? `avg(${cell})`
            : s.aggregation === 'sum'
              ? `sum(${cell})`
              : `${s.aggregation}(${cell})`;
      select.push(`${fill === null || s.aggregation === 'count' ? agg : `COALESCE(${agg}, ${fill})`} AS ${quoteIdent(outName)}`);
      newColumns.push({ name: outName, type: resultType });
    }
    const by = keys.length > 0 ? ` GROUP BY ${keys.map((k) => quoteIdent(k.name)).join(', ')} ORDER BY ${keys.map((k) => quoteIdent(k.name)).join(', ')}` : '';
    return { out: { sql: `SELECT ${select.join(', ')} FROM ${quoteIdent(input.relation)}${by}`, columns: [...keys, ...newColumns] } };
  },
};
