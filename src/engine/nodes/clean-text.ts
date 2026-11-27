import { quoteIdent } from '../sql';
import { EngineError } from '../types';
import type { Column } from '../types';
import { requireColumn } from './columns';
import type { NodeModule } from './types';

export const CASE_MODES = ['keep', 'upper', 'lower', 'proper'] as const;
export type CaseMode = (typeof CASE_MODES)[number];

export interface CleanSettings {
  columns: string[];
  trim: boolean;
  collapse: boolean;
  nonPrinting: boolean;
  caseMode: CaseMode;
  removeMarks: boolean;
  target: 'replace' | 'suffix';
  suffix: string;
}

export function parseCleanSettings(raw: Record<string, unknown>, nodeId: string): CleanSettings {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Clean text step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  const columns = raw.columns ?? [];
  if (!Array.isArray(columns) || columns.some((c) => typeof c !== 'string' || c === '')) bad('"columns" must be a list of column names.');
  if ((columns as string[]).length === 0) bad('there is no column to clean. Choose at least one text column.');
  const flag = (value: unknown, name: string, fallback: boolean): boolean => {
    const v = value ?? fallback;
    if (typeof v !== 'boolean') bad(`"${name}" must be true or false.`);
    return v as boolean;
  };
  const caseMode = raw.caseMode ?? 'keep';
  if (!(CASE_MODES as readonly unknown[]).includes(caseMode)) bad(`"caseMode" is ${JSON.stringify(caseMode)}; use one of ${CASE_MODES.join(', ')}.`);
  const target = raw.target ?? 'replace';
  if (target !== 'replace' && target !== 'suffix') bad(`"target" is ${JSON.stringify(target)}; use replace or suffix.`);
  const suffix = raw.suffix ?? '_clean';
  if (typeof suffix !== 'string') bad('"suffix" must be a text.');
  if (target === 'suffix' && (suffix as string).trim() === '') bad('the result is written to new columns, but the suffix is empty. Type a suffix such as _clean.');
  const s: CleanSettings = {
    columns: columns as string[],
    trim: flag(raw.trim, 'trim', true),
    collapse: flag(raw.collapse, 'collapse', true),
    nonPrinting: flag(raw.nonPrinting, 'nonPrinting', false),
    caseMode: caseMode as CaseMode,
    removeMarks: flag(raw.removeMarks, 'removeMarks', false),
    target: target as 'replace' | 'suffix',
    suffix: suffix as string,
  };
  if (!s.trim && !s.collapse && !s.nonPrinting && !s.removeMarks && s.caseMode === 'keep') {
    bad('nothing is chosen to clean. Turn on at least one of trim, collapse spaces, remove characters that do not print, remove marks, or a letter case.');
  }
  return s;
}

// RE2 classes for the regular expressions below. A line break, a tab, a non-breaking space and the other spaces of Unicode
// become a space; the characters that print nothing and take no room (controls, zero-width marks, the byte order mark) are removed.
const BECOMES_SPACE = String.raw`[\t\n\x{000B}\x{000C}\r\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}]`;
const REMOVED = String.raw`[\x{0001}-\x{0008}\x{000E}-\x{001F}\x{007F}-\x{009F}\x{00AD}\x{200B}-\x{200D}\x{2060}\x{FEFF}]`;

/** The SQL that cleans the text expression `e`, in this order: characters, spaces, ends, marks, letter case. */
export function cleanSql(e: string, s: CleanSettings): string {
  let x = e;
  if (s.nonPrinting) x = `regexp_replace(regexp_replace(${x}, '${BECOMES_SPACE}', ' ', 'g'), '${REMOVED}', '', 'g')`;
  if (s.collapse) x = `regexp_replace(${x}, ' {2,}', ' ', 'g')`;
  if (s.trim) x = `trim(${x})`;
  // strip_accents removes the marks of the precomposed and of the combining forms alike; it leaves the stroke of d.
  if (s.removeMarks) x = `replace(replace(strip_accents(${x}), 'đ', 'd'), 'Đ', 'D')`;
  if (s.caseMode === 'upper') x = `upper(${x})`;
  else if (s.caseMode === 'lower') x = `lower(${x})`;
  else if (s.caseMode === 'proper') x = `array_to_string(list_transform(string_split(lower(${x}), ' '), w -> upper(w[1]) || w[2:]), ' ')`;
  return `NULLIF(${x}, '')`;
}

/**
 * Cleans the text of the chosen columns (SPEC 15.4 item 5): characters that do not print, runs of spaces, spaces at the ends,
 * Vietnamese marks (the stroke of d too) and the letter case (Proper Case capitalises each word between spaces). The result replaces
 * the column or goes to a new column named with a suffix. A cleaned text that is empty is empty (no cell). A null stays null.
 */
export const cleanTextNode: NodeModule = {
  type: 'clean_text',
  compile: ({ node, inputs }) => {
    const input = inputs.in!;
    const s = parseCleanSettings(node.settings, node.id);
    const chosen = s.columns.map((name) => requireColumn(input.columns, name, node.id));
    for (const c of chosen) {
      if (c.type !== 'text') {
        throw new EngineError('invalid_settings', `Clean text step "${node.id}": "${c.name}" is a ${c.type} column, but only a text column can be cleaned. Remove it from the list.`, node.id);
      }
    }
    const select: string[] = [];
    const columns: Column[] = [];
    const taken = new Set(input.columns.map((c) => c.name));
    for (const c of input.columns) {
      const hit = chosen.find((x) => x.name === c.name);
      const clean = hit ? cleanSql(quoteIdent(c.name), s) : undefined;
      if (hit && s.target === 'replace') {
        select.push(`${clean} AS ${quoteIdent(c.name)}`);
        columns.push(c);
        continue;
      }
      select.push(quoteIdent(c.name));
      columns.push(c);
      if (hit && clean) {
        const name = `${c.name}${s.suffix}`;
        if (taken.has(name)) {
          throw new EngineError('invalid_settings', `Clean text step "${node.id}": a column named "${name}" already exists. Use another suffix.`, node.id);
        }
        taken.add(name);
        select.push(`${clean} AS ${quoteIdent(name)}`);
        columns.push({ name, type: 'text' });
      }
    }
    return { out: { sql: `SELECT ${select.join(', ')} FROM ${quoteIdent(input.relation)} ORDER BY rowid`, columns } };
  },
};
