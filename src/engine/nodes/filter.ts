import { compileStepFormula } from '../formula/node-formula';
import { quoteIdent } from '../sql';
import { EngineError } from '../types';
import type { NodeModule } from './types';

/**
 * Keeps the rows for which the condition is true and sends every other row, including rows where the
 * condition is blank, to the second output. The two outputs always add up to the input.
 */
export const filterNode: NodeModule = {
  type: 'filter',
  compile: ({ node, inputs, effectiveDate }) => {
    const input = inputs.in!;
    const condition = compileStepFormula(
      node.settings.condition,
      { columns: input.columns, effectiveDate },
      { id: node.id, label: 'Filter', setting: 'condition' },
    );
    if (condition.type !== 'boolean') {
      throw new EngineError(
        'invalid_formula',
        `Filter step "${node.id}": the condition must give true or false, but it gives a ${condition.type}. Compare the value with something, for example [Column] > 0.`,
        node.id,
      );
    }
    const from = quoteIdent(input.relation);
    return {
      match: { sql: `SELECT * FROM ${from} WHERE (${condition.sql}) IS TRUE`, columns: input.columns },
      nomatch: { sql: `SELECT * FROM ${from} WHERE (${condition.sql}) IS NOT TRUE`, columns: input.columns },
    };
  },
};
