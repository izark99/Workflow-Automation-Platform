import type { FlowDefinition } from '../flow/types';
import { compileStepFormula } from '../formula/node-formula';
import { parsePrintSettings, PrintSettingsError } from '../output/print/settings';
import type { PrintSettings } from '../output/print/settings';
import { quoteIdent } from '../sql';
import { EngineError } from '../types';
import { requireColumn } from './columns';
import type { NodeModule } from './types';

export interface OutputSettings {
  /** Logical name of the output file. Steps with the same name write sheets of one workbook. */
  file: string;
  format: 'xlsx' | 'csv';
  /** Sheet name. Needed for xlsx. */
  sheet: string | undefined;
  sort: { column?: string; expression?: string; direction: 'asc' | 'desc' }[];
  /** Columns written in this order. All columns when unset. */
  columns: string[] | undefined;
  /** Text columns whose plain-number values are written as numbers (D27). */
  numberLikeText: string[];
  /** The print layout (SPEC 16.1). Undefined when the step has none. */
  print: PrintSettings | undefined;
}

/** The print layout of the step, or undefined. A message of the layout becomes a message of the step. */
function printOf(raw: unknown, bad: (rule: string) => never): PrintSettings | undefined {
  if (raw === undefined) return undefined;
  try {
    return parsePrintSettings(raw);
  } catch (e) {
    if (e instanceof PrintSettingsError) return bad(e.message);
    throw e;
  }
}

const SHEET_NAME = /^[^[\]:*?/\\]{1,31}$/;

export function parseOutputSettings(raw: Record<string, unknown>, nodeId: string): OutputSettings {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Output step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  const names = (v: unknown, what: string): string[] => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || x === '')) return bad(`"${what}" must be a list of column names.`);
    return v as string[];
  };
  const file = raw.file ?? 'Result';
  if (typeof file !== 'string' || file.trim() === '') bad('"file" must be a non-empty name.');
  const format: unknown = raw.format ?? 'xlsx';
  if (format !== 'xlsx' && format !== 'csv') bad('"format" must be xlsx or csv.');
  let sheet: string | undefined;
  if (format === 'xlsx') {
    if (typeof raw.sheet !== 'string' || !SHEET_NAME.test(raw.sheet) || /^'|'$/.test(raw.sheet)) {
      bad('"sheet" must be a sheet name of 1 to 31 characters, without [ ] : * ? / \\ and not starting or ending with an apostrophe.');
    }
    sheet = raw.sheet as string;
  }
  const sort = (raw.sort ?? []) as unknown;
  if (!Array.isArray(sort)) bad('"sort" must be a list.');
  const parsedSort = (sort as unknown[]).map((s, i) => {
    if (typeof s !== 'object' || s === null || Array.isArray(s)) return bad(`sort ${i + 1} must be an object.`);
    const o = s as Record<string, unknown>;
    if ((o.column === undefined) === (o.expression === undefined)) return bad(`sort ${i + 1} needs either a "column" or an "expression", not both.`);
    if (o.column !== undefined && (typeof o.column !== 'string' || o.column === '')) return bad(`sort ${i + 1} has an empty "column".`);
    if (o.expression !== undefined && (typeof o.expression !== 'string' || o.expression.trim() === '')) return bad(`sort ${i + 1} has an empty "expression".`);
    const direction = o.direction ?? 'asc';
    if (direction !== 'asc' && direction !== 'desc') return bad(`sort ${i + 1} has "direction" ${JSON.stringify(direction)}; use asc or desc.`);
    return { column: o.column as string | undefined, expression: o.expression as string | undefined, direction: direction as 'asc' | 'desc' };
  });
  const columns = raw.columns === undefined ? undefined : names(raw.columns, 'columns');
  if (columns && (columns.length === 0 || new Set(columns).size !== columns.length)) {
    bad('"columns" must list at least one column, each once.');
  }
  return {
    file: file as string,
    format: format as OutputSettings['format'],
    sheet,
    sort: parsedSort,
    columns,
    numberLikeText: raw.numberLikeText === undefined ? [] : names(raw.numberLikeText, 'numberLikeText'),
    print: printOf(raw.print, bad),
  };
}

/** Checks all Output steps of a flow together: unique sheet names per workbook, one format per file, one csv step per file. */
export function checkOutputNodes(flow: Pick<FlowDefinition, 'nodes'>): void {
  interface FileEntry {
    format: string;
    sheets: Map<string, { step: string; name: string }>;
    steps: string[];
  }
  const files = new Map<string, FileEntry>();
  for (const node of flow.nodes.filter((n) => n.type === 'output')) {
    const s = parseOutputSettings(node.settings, node.id);
    const entry: FileEntry = files.get(s.file) ?? { format: s.format, sheets: new Map(), steps: [] };
    files.set(s.file, entry);
    const fail = (message: string): never => {
      throw new EngineError('invalid_settings', `Output step "${node.id}": ${message}`, node.id);
    };
    if (entry.format !== s.format) {
      fail(`the file "${s.file}" is used with the format ${entry.format} and ${s.format}. Give each format its own file name.`);
    }
    if (s.format === 'csv' && entry.steps.length > 0) {
      fail(`a csv file holds one table, but "${s.file}" has two Output steps ("${entry.steps[0]}" and "${node.id}"). Use xlsx for several sheets, or another file name.`);
    }
    if (s.sheet !== undefined) {
      const key = s.sheet.toLowerCase();
      const other = entry.sheets.get(key);
      if (other !== undefined) {
        fail(`the sheet "${s.sheet}" has the same name as the sheet "${other.name}" that step "${other.step}" writes in the file "${s.file}" (sheet names ignore case). Choose another sheet name.`);
      }
      entry.sheets.set(key, { step: node.id, name: s.sheet });
    }
    entry.steps.push(node.id);
  }
}

/**
 * Prepares the table of an Output step: optional sort (by columns or by a formula, blanks last, ties in input
 * order) and optional list of columns. The file is built from it by `buildOutputFiles`. See D27.
 */
export const outputNode: NodeModule = {
  type: 'output',
  compile: ({ node, inputs, effectiveDate, parameters }) => {
    const input = inputs.in!;
    const s = parseOutputSettings(node.settings, node.id);
    const columns = s.columns ? s.columns.map((c) => requireColumn(input.columns, c, node.id)) : input.columns;
    for (const name of s.numberLikeText) {
      if (requireColumn(columns, name, node.id).type !== 'text') {
        throw new EngineError(
          'invalid_settings',
          `Output step "${node.id}": "numberLikeText" works on a text column, but "${name}" is not text. Remove it from the list.`,
          node.id,
        );
      }
    }
    const order = s.sort.map((k) => {
      const expr =
        k.column !== undefined
          ? quoteIdent(requireColumn(input.columns, k.column, node.id).name)
          : compileStepFormula(k.expression, { columns: input.columns, effectiveDate, parameters }, { id: node.id, label: 'Output', setting: 'sort' }).sql;
      return `${expr} ${k.direction.toUpperCase()} NULLS LAST`;
    });
    order.push('rowid');
    const select = s.columns ? columns.map((c) => quoteIdent(c.name)).join(', ') : '*';
    return { result: { sql: `SELECT ${select} FROM ${quoteIdent(input.relation)} ORDER BY ${order.join(', ')}`, columns } };
  },
};
