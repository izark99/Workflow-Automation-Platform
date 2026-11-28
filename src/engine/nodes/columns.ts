import { quoteIdent } from '../sql';
import { EngineError, type Column } from '../types';

/**
 * Returns the column with exactly this name. DuckDB matches quoted names without regard to case,
 * so the engine checks names itself: `[OT hours]` and `[ot hours]` are different columns.
 */
export function requireColumn(columns: Column[], name: string, nodeId?: string): Column {
  const exact = columns.find((c) => c.name === name);
  if (exact) return exact;
  const close = columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
  const hint = close
    ? ` The input has "${close.name}"; column names are case-sensitive, so use that spelling.`
    : ` Available columns: ${columns.map((c) => `"${c.name}"`).join(', ') || '(none)'}.`;
  throw new EngineError('unknown_column', `Column "${name}" does not exist in the input of this step.${hint}`, nodeId);
}

/**
 * The SQL that groups or compares by a column: an empty text is made NULL, so that "" and a blank cell are the same value.
 * (All NULLs of a column fall in one group of a window partition.)
 */
export function nullAwareTerm(column: Column): string {
  return column.type === 'text' ? `NULLIF(${quoteIdent(column.name)}, '')` : quoteIdent(column.name);
}
