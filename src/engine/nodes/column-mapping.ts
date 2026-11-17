import { quoteIdent } from '../sql';
import { EngineError, type Column, type ColumnType } from '../types';
import { requireColumn } from './columns';
import type { NodeModule } from './types';

interface MappingRow {
  source: string;
  keep: boolean;
  name: string;
  type: ColumnType | undefined;
}

const TYPES: readonly ColumnType[] = ['text', 'number', 'date', 'boolean'];

function parseSettings(raw: Record<string, unknown>, nodeId: string): MappingRow[] {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Column mapping step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  if (!Array.isArray(raw.columns)) return bad('"columns" must be a list with one row per source column.');
  const seen = new Set<string>();
  return raw.columns.map((row: unknown, i: number) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return bad(`row ${i + 1} must be an object.`);
    const r = row as Record<string, unknown>;
    if (typeof r.source !== 'string' || r.source === '') return bad(`row ${i + 1} needs the "source" column name.`);
    if (seen.has(r.source)) return bad(`the source column "${r.source}" appears twice.`);
    seen.add(r.source);
    if (r.keep !== undefined && typeof r.keep !== 'boolean') return bad(`"keep" of "${r.source}" must be true or false.`);
    if (r.name !== undefined && (typeof r.name !== 'string' || r.name.trim() === '')) {
      return bad(`the new name of "${r.source}" must be a non-empty text.`);
    }
    if (r.type !== undefined && !TYPES.includes(r.type as ColumnType)) {
      return bad(`the type of "${r.source}" must be one of: ${TYPES.join(', ')}.`);
    }
    return {
      source: r.source,
      keep: r.keep !== false,
      name: typeof r.name === 'string' ? r.name : r.source,
      type: r.type as ColumnType | undefined,
    };
  });
}

/** SQL for one column, converted to `to`. Throws for a conversion that has no clear meaning. */
function convert(id: string, from: ColumnType, to: ColumnType, nodeId: string, name: string): string {
  if (from === to) return id;
  const unsupported = () => {
    throw new EngineError(
      'invalid_settings',
      `Column mapping step "${nodeId}": a ${from} column ("${name}") cannot be changed to ${to}. Keep its type, or use a Formula column step.`,
      nodeId,
    );
  };
  switch (to) {
    case 'text':
      if (from === 'number') return `regexp_replace(CAST(${id} AS VARCHAR), '\\.0$', '')`;
      if (from === 'date') return `strftime(${id}, '%Y-%m-%d')`;
      return `lower(CAST(${id} AS VARCHAR))`;
    case 'number':
      if (from === 'text') return `CAST(NULLIF(trim(${id}), '') AS DOUBLE)`;
      if (from === 'boolean') return `CAST(${id} AS DOUBLE)`;
      return unsupported();
    case 'date':
      return from === 'text' ? `CAST(NULLIF(trim(${id}), '') AS DATE)` : unsupported();
    case 'boolean':
      if (from === 'text') return `CAST(NULLIF(lower(trim(${id})), '') AS BOOLEAN)`;
      return `(${id} <> 0)`;
  }
}

/**
 * One grid row per source column: keep or drop, new name, new type. Columns that the grid does not list
 * stay unchanged and come after the listed ones, so a new column in the file is not lost silently (D16).
 */
export const columnMappingNode: NodeModule = {
  type: 'column_mapping',
  compile: ({ node, inputs }) => {
    const input = inputs.in!;
    const rows = parseSettings(node.settings, node.id);
    for (const r of rows) requireColumn(input.columns, r.source, node.id);

    const listed = new Set(rows.map((r) => r.source));
    const all: MappingRow[] = [
      ...rows,
      ...input.columns.filter((c) => !listed.has(c.name)).map((c) => ({ source: c.name, keep: true, name: c.name, type: undefined })),
    ];
    const kept = all.filter((r) => r.keep);
    if (kept.length === 0) {
      throw new EngineError(
        'invalid_settings',
        `Column mapping step "${node.id}" drops every column. Keep at least one column.`,
        node.id,
      );
    }
    const lower = new Map<string, string>();
    for (const r of kept) {
      const key = r.name.toLowerCase();
      const other = lower.get(key);
      if (other !== undefined) {
        throw new EngineError(
          'invalid_settings',
          `Column mapping step "${node.id}" would create "${other}" and "${r.name}", which differ only by case and cannot share one table. Rename one of them.`,
          node.id,
        );
      }
      lower.set(key, r.name);
    }

    const columns: Column[] = [];
    const select = kept.map((r) => {
      const from = input.columns.find((c) => c.name === r.source)!.type;
      const to = r.type ?? from;
      columns.push({ name: r.name, type: to });
      return `${convert(quoteIdent(r.source), from, to, node.id, r.source)} AS ${quoteIdent(r.name)}`;
    });
    return { out: { sql: `SELECT ${select.join(', ')} FROM ${quoteIdent(input.relation)}`, columns } };
  },
};
