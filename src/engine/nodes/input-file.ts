import { quoteIdent } from '../sql';
import { EngineError } from '../types';
import type { NodeModule } from './types';

/** The file is read before the nodes run (`loadInputFile`). The node only exposes the loaded table. */
export const inputFileNode: NodeModule = {
  type: 'input_file',
  compile: ({ node, inputTables }) => {
    const key = String(node.settings.key);
    const table = inputTables[key];
    if (!table) {
      throw new EngineError(
        'missing_input_table',
        `No file was provided for input "${key}". Choose a file for it and run again.`,
        node.id,
      );
    }
    return { out: { sql: `SELECT * FROM ${quoteIdent(table.relation)}`, columns: table.columns } };
  },
};
