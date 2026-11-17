import { FormulaError, parseFormula } from '../../../engine/formula/parse';

export type FormulaCheck = { ok: true } | { ok: false; message: string; position: number; length: number };

/**
 * Checks how a formula is written (brackets, quotes, operators, function calls). Column names and the result type are
 * checked when the step runs or is previewed, because they depend on the data.
 */
export function checkFormulaSyntax(source: string): FormulaCheck {
  if (source.trim() === '') return { ok: false, message: 'The formula is empty. Write a formula, for example [OT hours] > 4.', position: 0, length: 0 };
  try {
    parseFormula(source);
    return { ok: true };
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, message: `Character ${e.position + 1}: ${e.message}`, position: e.position, length: e.length };
    throw e;
  }
}
