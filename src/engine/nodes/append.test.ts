import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import { EngineError, type SqlRunner, type TableData } from '../types';
import { runNode } from './test-helpers';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const a: TableData = {
  columns: [
    { name: 'Id', type: 'number' },
    { name: 'Name', type: 'text' },
  ],
  rows: [[1, 'a1'], [2, 'a2']],
};
const b: TableData = {
  columns: [
    { name: 'Name', type: 'text' },
    { name: 'Extra', type: 'date' },
    { name: 'Id', type: 'number' },
  ],
  rows: [['b1', '2026-09-01', 10]],
};
const c: TableData = { columns: [{ name: 'Id', type: 'number' }], rows: [[100], [200]] };

const append = (settings: Record<string, unknown>, inputs: Record<string, TableData>, limit?: number) =>
  runNode(runner, 'append', { settings, inputs, limit });

describe('append by name', () => {
  it('stacks the inputs in order, matches columns by name, and leaves a blank where an input has no such column', async () => {
    const r = await append({}, { in1: a, in2: b, in3: c });
    expect(r.columns).toEqual([
      { name: 'Id', type: 'number' },
      { name: 'Name', type: 'text' },
      { name: 'Extra', type: 'date' },
    ]);
    expect(r.rows).toEqual([
      [1, 'a1', null],
      [2, 'a2', null],
      [10, 'b1', '2026-09-01'],
      [100, null, null],
      [200, null, null],
    ]);
  });

  it('is the default and can be named', async () => {
    const r = await append({ match: 'name' }, { in1: a, in2: b });
    expect(r.rows).toHaveLength(3);
  });

  it('keeps the row order of every input for many rows', async () => {
    const many = (start: number): TableData => ({
      columns: [{ name: 'Id', type: 'number' }],
      rows: Array.from({ length: 300 }, (_, i) => [start + i]),
    });
    const r = await append({}, { in1: many(0), in2: many(1000) }, 1000);
    expect(r.rows.map((row) => row[0])).toEqual([...many(0).rows, ...many(1000).rows].map((row) => row[0]));
  });

  it('refuses one column name with two types, and names that differ only by case', async () => {
    const text: TableData = { columns: [{ name: 'Id', type: 'text' }], rows: [['x']] };
    const type = await append({}, { in1: a, in2: text }).catch((e: unknown) => e);
    expect((type as EngineError).code).toBe('invalid_settings');
    expect((type as EngineError).message).toMatch(/Column mapping/);
    expect((type as EngineError).message).toContain('"Id"');
    const caseOnly: TableData = { columns: [{ name: 'id', type: 'number' }], rows: [[1]] };
    const cs = await append({}, { in1: a, in2: caseOnly }).catch((e: unknown) => e);
    expect((cs as EngineError).code).toBe('invalid_settings');
    expect((cs as EngineError).message).toMatch(/case/);
  });
});

describe('append by position', () => {
  it('takes the names of the first input and needs the same number of columns', async () => {
    const other: TableData = {
      columns: [
        { name: 'x', type: 'number' },
        { name: 'y', type: 'text' },
      ],
      rows: [[7, 'q']],
    };
    const r = await append({ match: 'position' }, { in1: a, in2: other });
    expect(r.columns.map((col) => col.name)).toEqual(['Id', 'Name']);
    expect(r.rows).toEqual([[1, 'a1'], [2, 'a2'], [7, 'q']]);
    const short = await append({ match: 'position' }, { in1: a, in2: c }).catch((e: unknown) => e);
    expect((short as EngineError).code).toBe('invalid_settings');
    expect((short as EngineError).message).toMatch(/in2 has 1 .*in1 has 2/s);
  });

  it('refuses a type that differs at a position', async () => {
    const swapped: TableData = {
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Id', type: 'number' },
      ],
      rows: [['z', 1]],
    };
    const err = await append({ match: 'position' }, { in1: a, in2: swapped }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_settings');
  });
});

describe('append settings', () => {
  it('refuses an unknown way to match', async () => {
    const err = await append({ match: 'fuzzy' }, { in1: a, in2: b }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_settings');
    expect((err as EngineError).message).toMatch(/name, position/);
  });
});
