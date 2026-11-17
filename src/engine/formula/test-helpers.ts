// Helpers for formula function tests: evaluate a formula on one row of a small table in real DuckDB.
import { createTableStatements } from '../sql';
import type { Cell, Column, SqlRunner, TableData } from '../types';
import { compileFormula } from './compile';
import { FormulaError } from './parse';

export const testColumns: Column[] = [
  { name: 'A', type: 'number' },
  { name: 'B', type: 'number' },
  { name: 'T', type: 'text' },
  { name: 'D', type: 'date' },
  { name: 'D2', type: 'date' },
  { name: 'F', type: 'boolean' },
];
export const fullRow: Cell[] = [3, 4, 'Hello', '2026-09-30', '2026-09-20', true];
export const blankRow: Cell[] = [null, null, null, null, null, null];

export const EFFECTIVE_DATE = '2026-09-30';
let counter = 0;

/** Returns `value(formula, row?)` and `fails(formula)`, bound to one runner. Dates come back as ISO text. */
export function formulaTester(runner: SqlRunner, columns: Column[] = testColumns) {
  return {
    async value(src: string, row: Cell[] = fullRow): Promise<unknown> {
      const compiled = compileFormula(src, { columns, effectiveDate: EFFECTIVE_DATE });
      const table = `fx_${++counter}`;
      const data: TableData = { columns, rows: [row] };
      for (const s of createTableStatements(table, data)) await runner.exec(s);
      const expr = compiled.type === 'date' ? `strftime(${compiled.sql}, '%Y-%m-%d')` : compiled.sql;
      const res = await runner.query(`SELECT ${expr} AS v FROM "${table}"`);
      return res.rows[0]?.[0];
    },
    fails(src: string): FormulaError {
      try {
        compileFormula(src, { columns, effectiveDate: EFFECTIVE_DATE });
      } catch (e) {
        if (e instanceof FormulaError) return e;
        throw e;
      }
      throw new Error(`"${src}" compiled, but it should fail`);
    },
  };
}
