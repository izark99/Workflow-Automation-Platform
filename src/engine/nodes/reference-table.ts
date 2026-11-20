import { quoteIdent } from '../sql';
import { EngineError } from '../types';
import type { NodeModule } from './types';

/**
 * The Reference table step (SPEC 13.3): all columns and rows of one reference table, in the version valid on the effective
 * date. The version is chosen before the run (`prepareRun`, the same resolver as the Lookup step), so the step only exposes
 * the table that was loaded for this run.
 */
export const referenceTableNode: NodeModule = {
  type: 'reference_table',
  compile: ({ node, refTables, effectiveDate }) => {
    const name = node.settings.table;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new EngineError('invalid_settings', `Reference table step "${node.id}": "table" must be the name of a reference table. Choose a table in the step settings.`, node.id);
    }
    const table = refTables[name];
    if (!table) {
      throw new EngineError(
        'missing_reference_table',
        `Reference table step "${node.id}": the reference table "${name}" is not available for this run (effective date ${effectiveDate}). Check the table name, and that one of its versions covers that date.`,
        node.id,
      );
    }
    return { out: { sql: `SELECT * FROM ${quoteIdent(table.relation)}`, columns: table.columns } };
  },
};
