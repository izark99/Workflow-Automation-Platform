import { VARIADIC_HANDLE } from '../flow/types';
import { quoteIdent, sqlType } from '../sql';
import { EngineError, type Column } from '../types';
import type { NodeModule } from './types';

/**
 * Stacks two or more inputs, in1 first. By name (default): the result has every column of every input, in order of
 * first appearance; an input without a column leaves it blank. By position: all inputs have the same number of
 * columns and the names of the first input are used. A column name with two types is refused (D26).
 */
export const appendNode: NodeModule = {
  type: 'append',
  compile: ({ node, inputs }) => {
    const bad = (message: string): never => {
      throw new EngineError('invalid_settings', `Append step "${node.id}": ${message}`, node.id);
    };
    const match = node.settings.match ?? 'name';
    if (match !== 'name' && match !== 'position') bad('"match" must be one of: name, position. Change it in the step settings.');

    const handles = Object.keys(inputs)
      .filter((h) => VARIADIC_HANDLE.test(h))
      .sort((x, y) => Number(x.slice(2)) - Number(y.slice(2)));
    const tables = handles.map((h) => inputs[h]!);

    let columns: Column[];
    let branches: string[];
    if (match === 'position') {
      const first = tables[0]!;
      tables.forEach((t, i) => {
        if (t.columns.length !== first.columns.length) {
          bad(`input ${handles[i]} has ${t.columns.length} columns, but ${handles[0]} has ${first.columns.length}. To stack by position, every input needs the same number of columns. Use a Column mapping step, or match by name.`);
        }
        t.columns.forEach((c, j) => {
          if (c.type !== first.columns[j]!.type) {
            bad(`column ${j + 1} is a ${c.type} in ${handles[i]} ("${c.name}") but a ${first.columns[j]!.type} in ${handles[0]} ("${first.columns[j]!.name}"). Change a type in a Column mapping step.`);
          }
        });
      });
      columns = first.columns;
      branches = tables.map((t, i) => {
        const list = t.columns.map((c, j) => `${quoteIdent(c.name)} AS ${quoteIdent(columns[j]!.name)}`);
        return `SELECT ${[...list, `${i} AS "__s"`, 'rowid AS "__r"'].join(', ')} FROM ${quoteIdent(t.relation)}`;
      });
    } else {
      const union = new Map<string, Column>();
      for (const t of tables) {
        for (const c of t.columns) {
          const seen = union.get(c.name.toLowerCase());
          if (!seen) {
            union.set(c.name.toLowerCase(), c);
          } else if (seen.name !== c.name) {
            bad(`the inputs have the columns "${seen.name}" and "${c.name}", which differ only by case and cannot share one table. Rename one of them in a Column mapping step.`);
          } else if (seen.type !== c.type) {
            bad(`the column "${c.name}" is a ${seen.type} in one input and a ${c.type} in another. Change one type in a Column mapping step.`);
          }
        }
      }
      columns = [...union.values()];
      branches = tables.map((t, i) => {
        const has = new Set(t.columns.map((c) => c.name));
        const list = columns.map((c) => (has.has(c.name) ? quoteIdent(c.name) : `CAST(NULL AS ${sqlType(c.type)}) AS ${quoteIdent(c.name)}`));
        return `SELECT ${[...list, `${i} AS "__s"`, 'rowid AS "__r"'].join(', ')} FROM ${quoteIdent(t.relation)}`;
      });
    }
    const outer = columns.map((c) => quoteIdent(c.name)).join(', ');
    return { out: { sql: `SELECT ${outer} FROM (${branches.join(' UNION ALL ')}) ORDER BY "__s", "__r"`, columns } };
  },
};
