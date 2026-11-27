import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import type { SqlRunner, TableData } from '../types';
import { parseTopNSettings } from './top-n';
import { runNode } from './test-helpers';
import { runFlow } from '../run';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const input: TableData = {
  columns: [
    { name: 'Id', type: 'text' },
    { name: 'Dept', type: 'text' },
    { name: 'Hours', type: 'number' },
  ],
  rows: [
    ['1', 'A', 5],
    ['2', 'B', 9],
    ['3', 'A', 9],
    ['4', 'A', 5],
    ['5', 'B', null],
    ['6', null, 7],
    ['7', 'A', 9],
    ['8', 'B', 3],
    ['9', null, 7],
  ],
};

const top = (settings: Record<string, unknown>, data = input) => runNode(runner, 'top_n', { settings, inputs: { in: data } });
const ids = (t: TableData) => t.rows.map((r) => r[0]);

describe('top N node', () => {
  it('keeps the N largest, largest first, and cuts ties by the input order (no ties kept)', async () => {
    // Hours 9 appears in rows 2, 3 and 7: with N = 2 the first two by input order stay.
    expect(ids(await top({ n: 2, order: 'largest', by: { column: 'Hours' } }))).toEqual(['2', '3']);
    expect(ids(await top({ n: 4, order: 'largest', by: { column: 'Hours' } }))).toEqual(['2', '3', '7', '6']);
  });

  it('keeps the N smallest, smallest first, with empty values last', async () => {
    expect(ids(await top({ n: 3, order: 'smallest', by: { column: 'Hours' } }))).toEqual(['8', '1', '4']);
    // N larger than the number of values: the empty value is chosen only after every value.
    const all = ids(await top({ n: 9, order: 'smallest', by: { column: 'Hours' } }));
    expect(all.at(-1)).toBe('5');
  });

  it('keeps the first N rows in the current order', async () => {
    expect(ids(await top({ n: 3, order: 'first' }))).toEqual(['1', '2', '3']);
  });

  it('works per group: the groups come in the order they first appear, each ranked inside, empty group is a group', async () => {
    const r = await top({ n: 2, order: 'largest', by: { column: 'Hours' }, groupBy: ['Dept'] });
    // A: rows 1(5) 3(9) 4(5) 7(9) -> 3, 7. B: 2(9) 5(null) 8(3) -> 2, 8. Empty: 6(7) 9(7) -> 6, 9.
    expect(ids(r)).toEqual(['3', '7', '2', '8', '6', '9']);
  });

  it('works per group with the first rows, in the input order inside a group', async () => {
    expect(ids(await top({ n: 1, order: 'first', groupBy: ['Dept'] }))).toEqual(['1', '2', '6']);
  });

  it('returns every row when N is larger than the table, and keeps the columns and types', async () => {
    const r = await top({ n: 1000, order: 'first' });
    expect(r.rows).toHaveLength(input.rows.length);
    expect(r.columns).toEqual(input.columns);
  });

  it('orders by a formula, and an empty text group equals an empty cell', async () => {
    expect(ids(await top({ n: 2, order: 'smallest', by: { expression: '[Hours] * -1' } }))).toEqual(['2', '3']);
    const mixed: TableData = { columns: input.columns, rows: [['1', '', 1], ['2', null, 2], ['3', 'A', 3]] };
    expect(ids(await top({ n: 1, order: 'largest', by: { column: 'Hours' }, groupBy: ['Dept'] }, mixed))).toEqual(['2', '3']);
  });

  it('works on an empty table', async () => {
    expect((await top({ n: 3, order: 'first' }, { columns: input.columns, rows: [] })).rows).toEqual([]);
  });

  it('says what failed: N not whole, below 1 or above the limit, no order column, an unknown column', async () => {
    for (const n of [0, -1, 1.5, '3', null, 1_000_001]) await expect(top({ n, order: 'first' })).rejects.toThrow(/whole number from 1 to 1,000,000/);
    await expect(top({ n: 3, order: 'largest' })).rejects.toThrow(/needs a column or a formula/);
    await expect(top({ n: 3, order: 'largest', by: { column: 'hours' } })).rejects.toThrow(/"Hours"/);
    await expect(top({ n: 3, order: 'first', groupBy: ['Nope'] })).rejects.toThrow(/Available columns/);
    await expect(top({ n: 3, order: 'middle' })).rejects.toThrow(/largest, smallest or first/);
  });
});

describe('parseTopNSettings', () => {
  it('reads the settings and accepts N at both limits', () => {
    expect(parseTopNSettings({ n: 1, order: 'first' }, 'x')).toMatchObject({ n: 1, order: 'first', groupBy: [] });
    expect(parseTopNSettings({ n: 1_000_000, order: 'largest', by: { expression: '[A]' }, groupBy: ['G'] }, 'x')).toMatchObject({ n: 1_000_000, by: { expression: '[A]' }, groupBy: ['G'] });
  });
  it('refuses a "by" with both or neither, and one that is empty', () => {
    expect(() => parseTopNSettings({ n: 1, by: { column: 'A', expression: 'x' } }, 'x')).toThrow(/not both/);
    expect(() => parseTopNSettings({ n: 1, by: {} }, 'x')).toThrow(/not both/);
    expect(() => parseTopNSettings({ n: 1, order: 'first', by: { column: '' } }, 'x')).toThrow(/empty "column"/);
  });
});

describe('top N with a parameter for N', () => {
  it('reads N from the parameter of the run: the same flow keeps 2 rows, then 4', async () => {
    const flow = {
      schemaVersion: 4,
      parameters: [{ key: 'n', label: 'How many', type: 'number', required: true }],
      nodes: [
        { id: 'src', type: 'input_file', settings: { key: 'k' } },
        { id: 'top', type: 'top_n', settings: { n: { $param: 'n' }, order: 'largest', by: { column: 'Hours' } } },
      ],
      edges: [{ source: 'src', target: 'top' }],
    };
    for (const [value, expected] of [[2, ['2', '3']], [4, ['2', '3', '7', '6']]] as const) {
      const result = await runFlow(runner, { flow, effectiveDate: '2026-09-30', inputs: { k: input }, refTables: {}, parameterValues: { n: value } });
      try {
        expect(ids(await result.preview('top'))).toEqual(expected);
      } finally {
        await result.dispose();
      }
    }
  });
});
