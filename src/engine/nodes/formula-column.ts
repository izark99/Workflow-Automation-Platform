import { compileStepFormula } from '../formula/node-formula';
import { quoteIdent } from '../sql';
import { EngineError, type Column } from '../types';
import type { NodeModule } from './types';

/**
 * Adds a column from a formula, or replaces the column of the same name in place. A name that differs from an
 * existing column only by case is refused, because one DuckDB table cannot hold both (D14).
 */
export const formulaColumnNode: NodeModule = {
  type: 'formula_column',
  compile: ({ node, inputs, effectiveDate, parameters }) => {
    const input = inputs.in!;
    const name = node.settings.name;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new EngineError(
        'invalid_settings',
        `Formula column step "${node.id}": "name" must be a non-empty text. Type the name of the new column in the step settings.`,
        node.id,
      );
    }
    const clash = input.columns.find((c) => c.name !== name && c.name.toLowerCase() === name.toLowerCase());
    if (clash) {
      throw new EngineError(
        'invalid_settings',
        `Formula column step "${node.id}": the column "${name}" differs from the existing column "${clash.name}" only by case, and one table cannot hold both. Use "${clash.name}" to replace it, or pick another name.`,
        node.id,
      );
    }
    const compiled = compileStepFormula(
      node.settings.expression,
      { columns: input.columns, effectiveDate, parameters },
      { id: node.id, label: 'Formula column', setting: 'expression' },
    );

    const value = `${compiled.sql} AS ${quoteIdent(name)}`;
    const exists = input.columns.some((c) => c.name === name);
    const columns: Column[] = exists
      ? input.columns.map((c) => (c.name === name ? { name, type: compiled.type } : c))
      : [...input.columns, { name, type: compiled.type }];
    const select = exists
      ? input.columns.map((c) => (c.name === name ? value : quoteIdent(c.name))).join(', ')
      : `*, ${value}`;
    return { out: { sql: `SELECT ${select} FROM ${quoteIdent(input.relation)}`, columns } };
  },
};
