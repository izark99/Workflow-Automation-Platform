import { quoteIdent } from '../sql';
import { EngineError } from '../types';
import type { Column } from '../types';
import { requireColumn } from './columns';
import type { NodeModule } from './types';

export const CUTS = ['comma', 'semicolon', 'space', 'tab', 'text', 'first_space', 'last_space'] as const;
export type Cut = (typeof CUTS)[number];
export const MAX_SPLIT_PARTS = 100;

export interface SplitSettings {
  column: string;
  cut: Cut;
  /** The text to cut at, for `text`. */
  separator: string;
  /** The names of the new columns; their number is the number of parts. */
  names: string[];
  rest: 'last' | 'drop';
  trim: boolean;
  keepOriginal: boolean;
}

export function parseSplitSettings(raw: Record<string, unknown>, nodeId: string): SplitSettings {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Split column step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  const column = raw.column;
  if (typeof column !== 'string' || column === '') bad('there is no column to split. Choose a text column.');
  const cut = raw.cut ?? 'space';
  if (!(CUTS as readonly unknown[]).includes(cut)) bad(`"cut" is ${JSON.stringify(cut)}; use one of ${CUTS.join(', ')}.`);
  const separator = raw.separator ?? '';
  if (typeof separator !== 'string') bad('"separator" must be a text.');
  if (cut === 'text' && separator === '') bad('the cut is at a given text, but the text is empty. Type the text to cut at.');
  const names = raw.names ?? [];
  if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) bad('"names" must be a list of column names.');
  const list = (names as string[]).map((n) => n.trim());
  if (list.length === 0) bad('there is no name for a new column. Add at least one name.');
  if (list.length > MAX_SPLIT_PARTS) bad(`there are ${list.length} new columns; at most ${MAX_SPLIT_PARTS}.`);
  if (list.some((n) => n === '')) bad('a new column has an empty name. Give every part a name.');
  const seen = new Set<string>();
  for (const n of list) {
    if (seen.has(n)) bad(`the new column name "${n}" is used twice. Give each part its own name.`);
    seen.add(n);
  }
  const rest = raw.rest ?? 'last';
  if (rest !== 'last' && rest !== 'drop') bad(`"rest" is ${JSON.stringify(rest)}; use last or drop.`);
  const trim = raw.trim ?? true;
  const keepOriginal = raw.keepOriginal ?? false;
  if (typeof trim !== 'boolean' || typeof keepOriginal !== 'boolean') bad('"trim" and "keepOriginal" must be true or false.');
  return { column: column as string, cut: cut as Cut, separator: separator as string, names: list, rest: rest as 'last' | 'drop', trim: trim as boolean, keepOriginal: keepOriginal as boolean };
}

const literal = (text: string): string => `'${text.replace(/'/g, "''")}'`;

/** The text between the parts, for putting the rest of the text back together. */
function glue(s: SplitSettings): string {
  switch (s.cut) {
    case 'comma':
      return ',';
    case 'semicolon':
      return ';';
    case 'tab':
      return '\t';
    case 'text':
      return s.separator;
    default:
      return ' ';
  }
}

/** The list of parts of the text `c` (a SQL expression): one entry per part, in order. NULL for a NULL text. */
function partsOf(c: string, s: SplitSettings): string {
  switch (s.cut) {
    case 'first_space':
      return `CASE WHEN strpos(${c}, ' ') = 0 THEN [${c}] ELSE [substr(${c}, 1, strpos(${c}, ' ') - 1), substr(${c}, strpos(${c}, ' ') + 1)] END`;
    case 'last_space': {
      const at = `(length(${c}) - strpos(reverse(${c}), ' ') + 1)`;
      return `CASE WHEN strpos(${c}, ' ') = 0 THEN [${c}] ELSE [substr(${c}, 1, ${at} - 1), substr(${c}, ${at} + 1)] END`;
    }
    default:
      return `string_split(${c}, ${literal(glue(s))})`;
  }
}

/**
 * Cuts a text column into parts (SPEC 15.4 item 4): at every comma, semicolon, space, tab or given text, at the first space,
 * or at the last space (a full name into the family and middle names and the given name). The parts go to the new columns in
 * order; with more parts than names the rest of the text goes in the last column or is dropped; a part that is missing is
 * empty. With `trim` the text and each part lose the spaces at their ends. An empty part is empty, not an empty text. The new
 * columns are text, in the place of the original column, which is kept or dropped.
 */
export const splitColumnNode: NodeModule = {
  type: 'split_column',
  compile: ({ node, inputs }) => {
    const input = inputs.in!;
    const s = parseSplitSettings(node.settings, node.id);
    const source = requireColumn(input.columns, s.column, node.id);
    if (source.type !== 'text') {
      throw new EngineError('invalid_settings', `Split column step "${node.id}": "${source.name}" is a ${source.type} column, but only a text column can be split. Choose a text column.`, node.id);
    }
    const remaining = input.columns.filter((c) => s.keepOriginal || c.name !== source.name);
    for (const name of s.names) {
      if (remaining.some((c) => c.name === name)) {
        throw new EngineError('invalid_settings', `Split column step "${node.id}": a column named "${name}" already exists. Give the new column another name.`, node.id);
      }
    }
    const text = s.trim ? `trim(${quoteIdent(source.name)})` : quoteIdent(source.name);
    const parts = partsOf(text, s);
    const clean = (e: string): string => `NULLIF(${s.trim ? `trim(${e})` : e}, '')`;
    const m = s.names.length;
    const made = s.names.map((name, i) => {
      const n = i + 1;
      const last = n === m;
      const piece =
        last && s.rest === 'last'
          ? `CASE WHEN len(${parts}) >= ${n} THEN array_to_string(list_slice(${parts}, ${n}, len(${parts})), ${literal(glue(s))}) END`
          : `list_extract(${parts}, ${n})`;
      return { column: { name, type: 'text' } as Column, sql: `${clean(piece)} AS ${quoteIdent(name)}` };
    });
    const select: string[] = [];
    const columns: Column[] = [];
    for (const c of input.columns) {
      if (c.name !== source.name) {
        select.push(quoteIdent(c.name));
        columns.push(c);
        continue;
      }
      if (s.keepOriginal) {
        select.push(quoteIdent(c.name));
        columns.push(c);
      }
      for (const m2 of made) {
        select.push(m2.sql);
        columns.push(m2.column);
      }
    }
    return { out: { sql: `SELECT ${select.join(', ')} FROM ${quoteIdent(input.relation)} ORDER BY rowid`, columns } };
  },
};
