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

const wide: TableData = {
  columns: [
    { name: 'Id', type: 'text' },
    { name: 'Kind', type: 'text' },
    { name: '1', type: 'number' },
    { name: '2', type: 'number' },
    { name: '3', type: 'number' },
  ],
  rows: [
    ['a', 'ATT', 1, null, 2.5],
    ['b', 'OT', 0, 4, 8],
  ],
};

const base = { keep: ['Id', 'Kind'], unpivot: ['1', '2', '3'], nameColumn: 'day', valueColumn: 'value' };
const unpivot = (settings: Record<string, unknown>, data: TableData = wide, limit?: number) =>
  runNode(runner, 'unpivot', { settings, inputs: { in: data }, limit });

describe('unpivot node', () => {
  it('makes one row per kept row and unpivoted column, in row order then column order', async () => {
    const r = await unpivot(base);
    expect(r.columns).toEqual([
      { name: 'Id', type: 'text' },
      { name: 'Kind', type: 'text' },
      { name: 'day', type: 'text' },
      { name: 'value', type: 'text' },
    ]);
    expect(r.rows).toEqual([
      ['a', 'ATT', '1', '1'],
      ['a', 'ATT', '2', null],
      ['a', 'ATT', '3', '2.5'],
      ['b', 'OT', '1', '0'],
      ['b', 'OT', '2', '4'],
      ['b', 'OT', '3', '8'],
    ]);
  });

  it('keeps blank cells as rows with a blank value, so a missing value can still be reported', async () => {
    const r = await unpivot(base);
    expect(r.rows.filter((row) => row[3] === null)).toHaveLength(1);
  });

  it('can skip blank cells', async () => {
    const r = await unpivot({ ...base, skipBlank: true });
    expect(r.rows).toHaveLength(5);
    expect(r.rows.some((row) => row[3] === null)).toBe(false);
  });

  it('writes every value as text with one number format, whatever the column types', async () => {
    const mixed: TableData = {
      columns: [
        { name: 'k', type: 'text' },
        { name: 'n', type: 'number' },
        { name: 'd', type: 'date' },
        { name: 'b', type: 'boolean' },
        { name: 't', type: 'text' },
      ],
      rows: [['x', 8, '2026-09-30', true, '2h']],
    };
    const r = await unpivot({ keep: ['k'], unpivot: ['n', 'd', 'b', 't'], nameColumn: 'what', valueColumn: 'v' }, mixed);
    expect(r.rows.map((row) => [row[1], row[2]])).toEqual([
      ['n', '8'],
      ['d', '2026-09-30'],
      ['b', 'TRUE'],
      ['t', '2h'],
    ]);
  });

  it('gives the same column types for any data, so one flow works for every month', async () => {
    const allBlank: TableData = { ...wide, rows: [['a', 'ATT', null, null, null]] };
    const a = await unpivot(base, allBlank);
    const b = await unpivot(base);
    expect(a.columns).toEqual(b.columns);
  });

  it('can keep no column and unpivot a subset of the others', async () => {
    const r = await unpivot({ keep: [], unpivot: ['1'], nameColumn: 'n', valueColumn: 'v' });
    expect(r.columns.map((c) => c.name)).toEqual(['n', 'v']);
    expect(r.rows).toEqual([['1', '1'], ['1', '0']]);
  });

  it('handles many columns and many rows in order', async () => {
    const columns = [{ name: 'Id', type: 'number' as const }, ...Array.from({ length: 31 }, (_, i) => ({ name: String(i + 1), type: 'number' as const }))];
    const rows = Array.from({ length: 20 }, (_, r) => [r, ...Array.from({ length: 31 }, (_, c) => r * 100 + c + 1)]);
    const r = await unpivot({ keep: ['Id'], unpivot: columns.slice(1).map((c) => c.name), nameColumn: 'day', valueColumn: 'v' }, { columns, rows }, 1000);
    expect(r.rows).toHaveLength(620);
    expect(r.rows.slice(0, 2)).toEqual([[0, '1', '1'], [0, '2', '2']]);
    expect(r.rows[31]).toEqual([1, '1', '101']);
  });

  it('checks names with their case, overlaps, and clashes with the new columns', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...base, keep: ['id'] }, 'unknown_column'],
      [{ ...base, unpivot: ['1', 'x'] }, 'unknown_column'],
      [{ ...base, unpivot: ['Id', '1'] }, 'invalid_settings'],
      [{ ...base, unpivot: [] }, 'invalid_settings'],
      [{ ...base, nameColumn: 'ID' }, 'invalid_settings'],
      [{ ...base, valueColumn: 'day' }, 'invalid_settings'],
      [{ ...base, valueColumn: '' }, 'invalid_settings'],
      [{ ...base, nameColumn: undefined }, 'invalid_settings'],
      [{ ...base, keep: 'Id' }, 'invalid_settings'],
      [{ ...base, skipBlank: 'yes' }, 'invalid_settings'],
    ];
    for (const [settings, code] of cases) {
      const err = await unpivot(settings).catch((e: unknown) => e);
      expect(err, JSON.stringify(settings)).toBeInstanceOf(EngineError);
      expect((err as EngineError).code, JSON.stringify(settings)).toBe(code);
    }
  });
});
