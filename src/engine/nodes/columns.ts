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
