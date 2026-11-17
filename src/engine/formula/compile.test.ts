import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import { createTableStatements } from '../sql';
import type { Cell, Column, SqlRunner, TableData } from '../types';
import { compileFormula } from './compile';
import type { FunctionRegistry } from './functions';
import { FormulaError } from './parse';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const columns: Column[] = [
  { name: 'A', type: 'number' },
  { name: 'B', type: 'number' },
  { name: 'T', type: 'text' },
  { name: 'D', type: 'date' },
  { name: 'D2', type: 'date' },
  { name: 'F', type: 'boolean' },
];
const full: Cell[] = [3, 4, 'Hello', '2026-09-30', '2026-09-20', true];
const blank: Cell[] = [null, null, null, null, null, null];

let n = 0;
/** Compiles a formula and evaluates it on one row. Dates come back as ISO text. */
async function evaluate(src: string, row: Cell[] = full, registry?: FunctionRegistry) {
  const compiled = compileFormula(src, { columns, effectiveDate: '2026-09-30' }, registry);
  const table = `ev_${++n}`;
  const data: TableData = { columns, rows: [row] };
  for (const s of createTableStatements(table, data)) await runner.exec(s);
  const expr = compiled.type === 'date' ? `strftime(${compiled.sql}, '%Y-%m-%d')` : compiled.sql;
  const res = await runner.query(`SELECT ${expr} AS v FROM "${table}"`);
  return { value: res.rows[0]?.[0], type: compiled.type };
}
const value = async (src: string, row?: Cell[]) => (await evaluate(src, row)).value;

function failure(src: string, registry?: FunctionRegistry): FormulaError {
  try {
    compileFormula(src, { columns, effectiveDate: '2026-09-30' }, registry);
  } catch (e) {
    expect(e).toBeInstanceOf(FormulaError);
    return e as FormulaError;
  }
  throw new Error(`"${src}" compiled, but it should fail`);
}

describe('literals and types', () => {
  it('gives each expression a type', async () => {
    expect((await evaluate('1')).type).toBe('number');
    expect((await evaluate('"x"')).type).toBe('text');
    expect((await evaluate('TRUE')).type).toBe('boolean');
    expect((await evaluate('[D]')).type).toBe('date');
    expect((await evaluate('1 < 2')).type).toBe('boolean');
    expect((await evaluate('1 & 2')).type).toBe('text');
  });
  it('quotes text literals and column names', async () => {
    expect(await value(`"it's"`)).toBe("it's");
    expect(await value('[T]')).toBe('Hello');
  });
});

describe('arithmetic', () => {
  it('follows precedence and returns DOUBLE numbers', async () => {
    expect(await value('1 + 2 * 3')).toBe(7);
    expect(await value('(1 + 2) * 3')).toBe(9);
    expect(await value('2^3^2')).toBe(64);
    expect(await value('-2^2')).toBe(4);
    expect(await value('10 / 4')).toBe(2.5);
    expect(await value('[A] * [B] - 2')).toBe(10);
    expect(await value('-[A]')).toBe(-3);
  });
  it('turns a division by zero and an impossible power into a blank, not an error', async () => {
    expect(await value('1 / 0')).toBeNull();
    expect(await value('[A] / ([B] - 4)')).toBeNull();
    expect(await value('(-8) ^ 0.5')).toBeNull();
  });
  it('counts a blank column cell as 0, but lets a blank result pass on', async () => {
    expect(await value('[A] + 1', blank)).toBe(1);
    expect(await value('[A] * [B]', blank)).toBe(0);
    expect(await value('+[A]', blank)).toBe(0);
    expect(await value('1 / 0 + 1')).toBeNull();
  });
  it('adds days to dates and subtracts dates', async () => {
    expect(await value('[D] + 1')).toBe('2026-10-01');
    expect(await value('1 + [D]')).toBe('2026-10-01');
    expect(await value('[D] - 10')).toBe('2026-09-20');
    expect(await value('[D] - [D2]')).toBe(10);
    expect((await evaluate('[D] - [D2]')).type).toBe('number');
  });
});

describe('text join', () => {
  it('joins with & and writes numbers, dates and booleans like Excel', async () => {
    expect(await value('"a" & "b"')).toBe('ab');
    expect(await value('1 & 2')).toBe('12');
    expect(await value('1.5 & "h"')).toBe('1.5h');
    expect(await value('[D] & ""')).toBe('2026-09-30');
    expect(await value('[F] & ""')).toBe('TRUE');
  });
  it('treats a blank as empty text', async () => {
    expect(await value('[T] & "x"', blank)).toBe('x');
    expect(await value('[A] & "x"', blank)).toBe('x');
  });
});

describe('comparison', () => {
  it('compares numbers, dates and booleans', async () => {
    expect(await value('[A] < [B]')).toBe(true);
    expect(await value('[A] >= [B]')).toBe(false);
    expect(await value('[A] <> 3')).toBe(false);
    expect(await value('[D] > [D2]')).toBe(true);
    expect(await value('[F] = TRUE')).toBe(true);
  });
  it('ignores case in text, as Excel does', async () => {
    expect(await value('"a" = "A"')).toBe(true);
    expect(await value('[T] = "hello"')).toBe(true);
    expect(await value('"a" < "B"')).toBe(true);
    expect(await value('"a" <> "A"')).toBe(false);
  });
  it('treats a blank column cell as 0 or empty text, and a blank date as unknown', async () => {
    expect(await value('[A] = 0', blank)).toBe(true);
    expect(await value('[T] = ""', blank)).toBe(true);
    expect(await value('[F] = FALSE', blank)).toBe(true);
    expect(await value('[D] > [D2]', blank)).toBeNull();
  });
  it('refuses to compare different types and points at the comparison', () => {
    const e = failure('1 + ([T] = 2)');
    expect(e.message).toContain('text');
    expect(e.message).toContain('number');
    expect(e.message).toMatch(/VALUE|TEXT/);
    expect([e.position, e.length]).toEqual([5, 7]);
  });
});

describe('type errors and columns', () => {
  it('refuses arithmetic on text, booleans and two dates, at the operand', () => {
    const t = failure('[A] + [T]');
    expect([t.position, t.length]).toEqual([6, 3]);
    expect(t.message).toMatch(/text/);
    expect(failure('TRUE * 2').position).toBe(0);
    expect(failure('[D] + [D2]').message).toMatch(/date/);
    expect(failure('-"x"').position).toBe(1);
  });
  it('is case-sensitive for columns and points at the reference', () => {
    const e = failure('1 + [a]');
    expect([e.position, e.length]).toEqual([4, 3]);
    expect(e.message).toContain('"A"');
    expect(e.message).toMatch(/case/);
    expect(failure('[Nope]').message).toMatch(/Available columns/);
  });
});

const registry: FunctionRegistry = {
  DOUBLE: {
    min: 1,
    max: 1,
    compile: (ctx) => ({ sql: `(${ctx.arg(0, 'number')} * 2)`, type: 'number' }),
  },
  PICK: {
    min: 2,
    max: 3,
    compile: (ctx) => ({ sql: ctx.arg(0, 'text'), type: 'text' }),
  },
};

describe('function registry', () => {
  it('calls a registered function, ignoring case, with nested calls and the blank rule', async () => {
    expect((await evaluate('double(double([A]))', full, registry)).value).toBe(12);
    expect((await evaluate('DOUBLE([A])', blank, registry)).value).toBe(0);
  });
  it('reports an unknown function at its name', () => {
    const e = failure('1 + NOPE(2)');
    expect([e.position, e.length]).toEqual([4, 4]);
    expect(e.message).toContain('NOPE');
    expect(e.message).toMatch(/not supported/);
  });
  it('rejects a function that is not in the default registry', () => {
    expect(failure('VLOOKUP(1)').message).toMatch(/not supported/);
  });
  it('checks the number of arguments and says how many were expected', () => {
    const few = failure('DOUBLE()', registry);
    expect(few.message).toMatch(/1 value/);
    const many = failure('PICK("a")', registry);
    expect(many.message).toMatch(/2 to 3 values/);
    expect(failure('DOUBLE(1, 2)', registry).message).toMatch(/at most|1 value/);
  });
  it('reports a wrong argument type at the argument', () => {
    const e = failure('DOUBLE([T])', registry);
    expect([e.position, e.length]).toEqual([7, 3]);
    expect(e.message).toMatch(/Argument 1 of DOUBLE/);
    expect(e.message).toMatch(/number/);
  });
});
