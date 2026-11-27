import { quoteIdent } from '../sql';
import { EngineError } from '../types';
import { requireColumn } from './columns';
import type { NodeModule } from './types';

export interface DedupeSettings {
  /** The columns that decide. Empty: all columns. */
  columns: string[];
  keep: 'first' | 'last';
}

export function parseDedupeSettings(raw: Record<string, unknown>, nodeId: string): DedupeSettings {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Remove duplicates step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  const columns = raw.columns ?? [];
  if (!Array.isArray(columns) || columns.some((c) => typeof c !== 'string' || c === '')) bad('"columns" must be a list of column names.');
  const keep = raw.keep ?? 'first';
  if (keep !== 'first' && keep !== 'last') bad(`"keep" is ${JSON.stringify(keep)}; use first or last.`);
  return { columns: columns as string[], keep: keep as 'first' | 'last' };
}

/**
 * Removes repeated rows (SPEC 15.4 item 2). Rows are the same when the deciding columns (all columns by default) hold the same
 * values; an empty value equals another empty value, and an empty text counts as empty. "First" and "last" are by the order of the
 * input. `kept` and `removed` both keep the order of the input, and together they hold every row once.
 */
export const dedupeNode: NodeModule = {
  type: 'dedupe',
  compile: ({ node, inputs }) => {
    const input = inputs.in!;
    const s = parseDedupeSettings(node.settings, node.id);
    const deciding = s.columns.length > 0 ? s.columns.map((c) => requireColumn(input.columns, c, node.id)) : input.columns;
    // A partition puts all NULLs of a column in one group. An empty text is made NULL too, so that "" and a blank cell are the same.
    const parts = deciding.map((c) => (c.type === 'text' ? `NULLIF(${quoteIdent(c.name)}, '')` : quoteIdent(c.name)));
    const direction = s.keep === 'last' ? 'DESC' : 'ASC';
    const partition = parts.length > 0 ? `PARTITION BY ${parts.join(', ')}` : '';
    const numbered = `SELECT *, rowid AS __rid, ROW_NUMBER() OVER (${partition} ORDER BY rowid ${direction}) AS __n FROM ${quoteIdent(input.relation)}`;
    const cols = input.columns.map((c) => quoteIdent(c.name)).join(', ');
    return {
      kept: { sql: `SELECT ${cols} FROM (${numbered}) WHERE __n = 1 ORDER BY __rid`, columns: input.columns },
      removed: { sql: `SELECT ${cols} FROM (${numbered}) WHERE __n > 1 ORDER BY __rid`, columns: input.columns },
    };
  },
};
