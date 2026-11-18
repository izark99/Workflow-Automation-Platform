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

const long: TableData = {
  columns: [
    { name: 'Person', type: 'text' },
    { name: 'Kind', type: 'text' },
    { name: 'Amount', type: 'number' },
  ],
  rows: [
    ['p2', 'B', 5],
    ['p1', 'A', 1],
    ['p1', 'A', 2],
    ['p1', 'C', 4],
    ['p2', 'A', null],
    ['p3', null, 9],
  ],
};

const base = { rowKeys: ['Person'], columnSource: 'Kind', value: 'Amount', aggregation: 'sum' };
const pivot = (settings: Record<string, unknown>, extra: Partial<Parameters<typeof runNode>[2]> = {}) =>
  runNode(runner, 'pivot', { settings, inputs: { in: long }, ...extra });

describe('pivot from the values in the data', () => {
  it('makes one column per distinct value, sorted, one row per key, and fills gaps with 0 for a sum', async () => {
    const r = await pivot(base);
    expect(r.columns).toEqual([
      { name: 'Person', type: 'text' },
      { name: 'A', type: 'number' },
      { name: 'B', type: 'number' },
      { name: 'C', type: 'number' },
    ]);
    expect(r.rows).toEqual([
      ['p1', 3, 0, 4],
      ['p2', 0, 5, 0],
      ['p3', 0, 0, 0],
    ]);
  });

  it('counts rows when no value column is set, and counts only filled cells of a value column', async () => {
    const rows = await pivot({ rowKeys: ['Person'], columnSource: 'Kind', aggregation: 'count' });
    expect(rows.rows).toEqual([
      ['p1', 2, 0, 1],
      ['p2', 1, 1, 0],
      ['p3', 0, 0, 0],
    ]);
    const filled = await pivot({ ...base, aggregation: 'count' });
    expect(filled.rows[1]).toEqual(['p2', 0, 1, 0]);
  });

  it('supports average, min and max, and a blank fill for them', async () => {
    const avg = await pivot({ ...base, aggregation: 'average' });
    expect(avg.rows[0]).toEqual(['p1', 1.5, null, 4]);
    const max = await pivot({ ...base, aggregation: 'max' });
    expect(max.rows[0]).toEqual(['p1', 2, null, 4]);
    expect(max.columns[1]).toEqual({ name: 'A', type: 'number' });
  });

  it('uses a chosen fill value', async () => {
    const r = await pivot({ ...base, fill: -1 });
    expect(r.rows[1]).toEqual(['p2', -1, 5, -1]);
    const blank = await pivot({ ...base, fill: null });
    expect(blank.rows[1]).toEqual(['p2', null, 5, null]);
  });

  it('names the columns with a prefix, a suffix and a case', async () => {
    const r = await pivot({ ...base, namePrefix: 'n_', nameSuffix: '_total', nameCase: 'lower' });
    expect(r.columns.map((c) => c.name)).toEqual(['Person', 'n_a_total', 'n_b_total', 'n_c_total']);
  });

  it('works without row keys, for one total row', async () => {
    const r = await pivot({ ...base, rowKeys: [] });
    expect(r.rows).toEqual([[3, 5, 4]]);
  });

  it('ignores rows whose column source is blank, and sorts rows by the keys', async () => {
    const r = await pivot(base);
    expect(r.rows.map((row) => row[0])).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('pivot with the column list from a reference table', () => {
  const ref: TableData = {
    columns: [
      { name: 'code', type: 'text' },
      { name: 'category', type: 'text' },
    ],
    rows: [
      ['x', 'C'],
      ['y', 'A'],
      ['z', 'C'],
      ['w', 'Z'],
      ['v', null],
    ],
  };
  const settings = { ...base, columns: { from: 'reference', table: 'cats', column: 'category' } };

  it('makes the columns in the order of the table, once each, also when the data has no row for them', async () => {
    const r = await pivot(settings, { refTables: { cats: ref } });
    expect(r.columns.map((c) => c.name)).toEqual(['Person', 'C', 'A', 'Z']);
    expect(r.rows).toEqual([
      ['p1', 4, 3, 0],
      ['p2', 0, 0, 0],
      ['p3', 0, 0, 0],
    ]);
  });

  it('ignores data values that are not in the table, so the columns never depend on the data', async () => {
    const r = await pivot(settings, { refTables: { cats: ref } });
    // "B" is in the data but not in the table, so p2 has no value in any column.
    expect(r.rows[1]).toEqual(['p2', 0, 0, 0]);
  });

  it('names a reference table that is missing and a column that is not in it', async () => {
    const missing = await pivot(settings).catch((e: unknown) => e);
    expect((missing as EngineError).code).toBe('missing_reference_table');
    expect((missing as EngineError).message).toContain('"cats"');
    const bad = await pivot({ ...settings, columns: { from: 'reference', table: 'cats', column: 'Category' } }, { refTables: { cats: ref } }).catch((e: unknown) => e);
    expect((bad as EngineError).code).toBe('unknown_column');
  });
});

describe('mistakes', () => {
  it('checks column names with their case, and types', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...base, rowKeys: ['person'] }, 'unknown_column'],
      [{ ...base, columnSource: 'kind' }, 'unknown_column'],
      [{ ...base, value: 'amount' }, 'unknown_column'],
      [{ ...base, value: 'Kind' }, 'invalid_settings'],
      [{ ...base, aggregation: 'median' }, 'invalid_settings'],
      [{ ...base, aggregation: undefined }, 'invalid_settings'],
      [{ ...base, value: undefined }, 'invalid_settings'],
      [{ ...base, rowKeys: ['Kind'] }, 'invalid_settings'],
      [{ ...base, rowKeys: 'Person' }, 'invalid_settings'],
      [{ ...base, columns: { from: 'sheet' } }, 'invalid_settings'],
      [{ ...base, nameCase: 'title' }, 'invalid_settings'],
      [{ ...base, fill: 'zero' }, 'invalid_settings'],
    ];
    for (const [settings, code] of cases) {
      const err = await pivot(settings).catch((e: unknown) => e);
      expect(err, JSON.stringify(settings)).toBeInstanceOf(EngineError);
      expect((err as EngineError).code, JSON.stringify(settings)).toBe(code);
    }
  });

  it('refuses generated names that clash with each other or with a key', async () => {
    const same: TableData = { ...long, rows: [['p', 'a', 1], ['p', 'A', 2]] };
    const lower = await runNode(runner, 'pivot', { settings: { ...base, nameCase: 'lower' }, inputs: { in: same } }).catch((e: unknown) => e);
    expect((lower as EngineError).code).toBe('invalid_settings');
    // The value "son" with the prefix "Per" gives "Person", the name of the row key (compared without case).
    const withKey: TableData = { ...long, rows: [['p', 'SON', 1]] };
    const key = await runNode(runner, 'pivot', { settings: { ...base, namePrefix: 'Per', nameCase: 'lower' }, inputs: { in: withKey } }).catch((e: unknown) => e);
    expect((key as EngineError).code).toBe('invalid_settings');
    expect((key as EngineError).message).toContain('"Person"');
  });

  it('refuses a pivot with too many columns and says to filter first', async () => {
    const wide: TableData = { ...long, rows: Array.from({ length: 501 }, (_, i) => ['p', `v${i}`, 1]) };
    const err = await runNode(runner, 'pivot', { settings: base, inputs: { in: wide } }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_settings');
    expect((err as EngineError).message).toMatch(/501/);
    expect((err as EngineError).message).toMatch(/Filter/);
  });
});
