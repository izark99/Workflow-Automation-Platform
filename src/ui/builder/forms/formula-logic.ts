import { translate } from '../../i18n';
import { compileFormula } from '../../../engine/formula/compile';
import { FormulaError, parseFormula } from '../../../engine/formula/parse';
import type { Column, ColumnType } from '../../../engine/types';

export type FormulaState =
  | { kind: 'empty'; message: string }
  | { kind: 'syntax_error'; message: string }
  /** Written correctly, but the column names and the result type are not checked because no columns are loaded. */
  | { kind: 'unchecked'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'valid'; type: ColumnType; message: string };

/**
 * What to tell the user about a formula. Without columns only the way it is written is checked. With the columns of the
 * input table the compiler also checks column names and types and gives the result type; `expect` is a type that the
 * result must have (a Filter condition must give boolean).
 */
export function checkFormula(source: string, columns: Column[] | null, effectiveDate: string, expect?: ColumnType): FormulaState {
  if (source.trim() === '') return { kind: 'empty', message: translate('builder.formula.state.empty') };
  try {
    parseFormula(source);
  } catch (e) {
    if (e instanceof FormulaError) return { kind: 'syntax_error', message: translate('builder.formula.state.position', { position: e.position + 1, message: e.message }) };
    throw e;
  }
  if (columns === null) {
    return { kind: 'unchecked', message: translate('builder.formula.state.unchecked') };
  }
  try {
    const compiled = compileFormula(source, { columns, effectiveDate });
    if (expect && compiled.type !== expect) {
      return { kind: 'invalid', message: translate('builder.formula.state.wrongType', { actual: compiled.type, needed: expect === 'boolean' ? translate('builder.formula.state.needBoolean') : translate('builder.formula.state.needType', { type: expect }) }) };
    }
    return { kind: 'valid', type: compiled.type, message: translate('builder.formula.state.valid', { type: compiled.type }) };
  } catch (e) {
    if (e instanceof FormulaError) return { kind: 'invalid', message: translate('builder.formula.state.position', { position: e.position + 1, message: e.message }) };
    throw e;
  }
}

/** Puts `insert` at the cursor (or over the selection) and says where the cursor goes: `caretBack` characters before the end of the insert. */
export function insertAtCursor(text: string, start: number, end: number, insert: string, caretBack = 0): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return { text: text.slice(0, from) + insert + text.slice(to), caret: from + insert.length - caretBack };
}

/** `NAME()` with the cursor between the brackets, or after them for a function without arguments. */
export function functionInsert(signature: string): { insert: string; caretBack: number } {
  const name = signature.slice(0, signature.indexOf('('));
  const noArgs = signature.endsWith('()');
  return { insert: `${name}()`, caretBack: noArgs ? 0 : 1 };
}

/** A column reference as a formula writes it. A closing bracket inside the name is doubled. */
export const columnReference = (name: string): string => `[${name.replace(/]/g, ']]')}]`;
