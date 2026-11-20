import { quoteIdent, quoteString } from '../sql';
import { EngineError, type Column, type LoadedTable } from '../types';
import { requireColumn } from './columns';
import type { CompileContext, NodeModule } from './types';

type NoMatch = 'blank' | 'drop' | 'fail';

interface Settings {
  source: { kind: 'reference'; table: string } | { kind: 'node' };
  keys: { left: string; right: string }[];
  bring: { column: string; as: string }[];
  onNoMatch: NoMatch;
}

export const NO_MATCH: readonly NoMatch[] = ['blank', 'drop', 'fail'];

function parse(raw: Record<string, unknown>, nodeId: string): Settings {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Lookup step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const text = (v: unknown): v is string => typeof v === 'string' && v !== '';

  const src = raw.source;
  if (!isObject(src) || (src.kind !== 'reference' && src.kind !== 'node')) {
    return bad('"source" must be a reference table ({"kind": "reference", "table": "name"}) or another step ({"kind": "node"}).');
  }
  if (src.kind === 'reference' && !text(src.table)) return bad('the source reference table needs a "table" name.');
  if (!Array.isArray(raw.keys) || raw.keys.length === 0) return bad('"keys" needs at least one pair of key columns.');
  const keys = raw.keys.map((k: unknown, i: number) => {
    if (!isObject(k) || !text(k.left) || !text(k.right)) return bad(`key ${i + 1} needs a "left" and a "right" column name.`);
    return { left: k.left, right: k.right };
  });
  if (!Array.isArray(raw.bring) || raw.bring.length === 0) return bad('"bring" needs at least one column to bring.');
  const bring = raw.bring.map((b: unknown, i: number) => {
    if (!isObject(b) || !text(b.column)) return bad(`column ${i + 1} to bring needs a "column" name.`);
    if (b.as !== undefined && !text(b.as)) return bad(`the new name ("as") of "${b.column}" must be a non-empty text.`);
    return { column: b.column, as: typeof b.as === 'string' ? b.as : b.column };
  });
  const onNoMatch = raw.onNoMatch ?? 'blank';
  if (!NO_MATCH.includes(onNoMatch as NoMatch)) {
    return bad(`"onNoMatch" must be one of: ${NO_MATCH.join(', ')}.`);
  }
  return {
    source: src.kind === 'reference' ? { kind: 'reference', table: src.table as string } : { kind: 'node' },
    keys,
    bring,
    onNoMatch: onNoMatch as NoMatch,
  };
}

function rightTable(ctx: CompileContext, s: Settings): { table: LoadedTable; label: string } {
  const { node, inputs, refTables, effectiveDate } = ctx;
  if (s.source.kind === 'reference') {
    if (inputs.right) {
      throw new EngineError(
        'invalid_settings',
        `Lookup step "${node.id}": a step is connected to the right input, but the source is the reference table "${s.source.table}". Remove the connection or set the source to another step.`,
        node.id,
      );
    }
    const table = refTables[s.source.table];
    if (!table) {
      throw new EngineError(
        'missing_reference_table',
        `Lookup step "${node.id}": the reference table "${s.source.table}" is not available for this run (effective date ${effectiveDate}). Check the table name, and that one of its versions covers that date.`,
        node.id,
      );
    }
    return { table, label: `reference table "${s.source.table}"` };
  }
  if (!inputs.right) {
    throw new EngineError(
      'invalid_settings',
      `Lookup step "${node.id}": the source is another step, but nothing is connected to the right input. Connect a step to it, or set the source to a reference table.`,
      node.id,
    );
  }
  return { table: inputs.right, label: 'the step on the right input' };
}

const L = '"__l"';
const R = '"__r"';

/**
 * Adds columns from a reference table or from another step. Keys match on exact values, except that text ignores
 * case, as in Excel. When the right side repeats a key, its first row wins, so the left rows never multiply. The
 * left rows keep their order. See D22.
 */
export const lookupJoinNode: NodeModule = {
  type: 'lookup_join',
  compile: (ctx) => {
    const { node } = ctx;
    const left = ctx.inputs.left!;
    const s = parse(node.settings, node.id);
    const { table: right, label } = rightTable(ctx, s);

    const keyTests = s.keys.map((k) => {
      const l = requireColumn(left.columns, k.left, node.id);
      const r = requireColumn(right.columns, k.right, node.id);
      if (l.type !== r.type) {
        throw new EngineError(
          'invalid_settings',
          `Lookup step "${node.id}": the key "${k.left}" is a ${l.type} but "${k.right}" is a ${r.type}, so they cannot match. Change the type of one of them in a Column mapping step.`,
          node.id,
        );
      }
      const a = `${L}.${quoteIdent(k.left)}`;
      const b = `${R}.${quoteIdent(k.right)}`;
      return { l, test: l.type === 'text' ? `lower(${a}) = lower(${b})` : `${a} = ${b}`, partition: l.type === 'text' ? `lower(${quoteIdent(k.right)})` : quoteIdent(k.right) };
    });

    const outNames = left.columns.map((c) => c.name.toLowerCase());
    const brought: Column[] = [];
    for (const b of s.bring) {
      const src = requireColumn(right.columns, b.column, node.id);
      if (outNames.includes(b.as.toLowerCase())) {
        throw new EngineError(
          'invalid_settings',
          `Lookup step "${node.id}": the column "${b.as}" already exists in the input (names that differ only by case count as the same). Give the brought column a new name in "as".`,
          node.id,
        );
      }
      outNames.push(b.as.toLowerCase());
      brought.push({ name: b.as, type: src.type });
    }

    const firstMatch =
      `SELECT * FROM (SELECT *, 1 AS "__matched", row_number() OVER (PARTITION BY ${keyTests.map((k) => k.partition).join(', ')} ORDER BY rowid) AS "__rn" ` +
      `FROM ${quoteIdent(right.relation)}) WHERE "__rn" = 1`;
    const keyText = s.keys.map((k) => `CAST(${L}.${quoteIdent(k.left)} AS VARCHAR)`).join(` || ', ' || `);
    const value = (b: { column: string; as: string }) => {
      const v = `${R}.${quoteIdent(b.column)}`;
      if (s.onNoMatch !== 'fail') return v;
      const prefix = `No match in ${label} for ${s.keys.map((k) => k.left).join(', ')} = `;
      const quote = quoteString("'");
      const message = `concat(${quoteString(prefix)}, ${quote}, COALESCE(${keyText}, '(blank)'), ${quote})`;
      return `CASE WHEN ${R}."__matched" IS NULL THEN error(${message}) ELSE ${v} END`;
    };
    const select = [
      `${L}.*`,
      ...s.bring.map((b) => `${value(b)} AS ${quoteIdent(b.as)}`),
    ].join(', ');
    const join = s.onNoMatch === 'drop' ? 'JOIN' : 'LEFT JOIN';
    const sql =
      `SELECT ${select} FROM ${quoteIdent(left.relation)} AS ${L} ${join} (${firstMatch}) AS ${R} ` +
      `ON ${keyTests.map((k) => k.test).join(' AND ')} ORDER BY ${L}.rowid`;
    return { out: { sql, columns: [...left.columns, ...brought] } };
  },
};
