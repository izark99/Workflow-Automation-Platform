import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import { EngineError, type SqlRunner, type TableData } from '../types';
import { parseSortKeys } from './sort';
import { runNode } from './test-helpers';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const input: TableData = {
  columns: [
    { name: 'Name', type: 'text' },
    { name: 'Dept', type: 'text' },
    { name: 'Hours', type: 'number' },
    { name: 'Day', type: 'date' },
  ],
  rows: [
    ['Lan', 'B', 5, '2026-09-03'],
    ['An', 'A', 5, '2026-09-01'],
    ['Bình', 'B', null, null],
    ['Cường', 'A', 9, '2026-09-02'],
    ['Dũng', 'B', 1, '2026-09-03'],
    ['Em', null, 5, '2026-09-02'],
  ],
};

const sort = (keys: unknown, data = input) => runNode(runner, 'sort', { settings: { keys }, inputs: { in: data } });
const names = (t: TableData) => t.rows.map((r) => r[0]);

describe('sort node', () => {
  it('sorts numbers ascending and descending, with empty values last in both', async () => {
    expect(names(await sort([{ column: 'Hours' }]))).toEqual(['Dũng', 'Lan', 'An', 'Em', 'Cường', 'Bình']);
    expect(names(await sort([{ column: 'Hours', direction: 'desc' }]))).toEqual(['Cường', 'Lan', 'An', 'Em', 'Dũng', 'Bình']);
  });

  it('keeps the input order of rows with equal keys (ties)', async () => {
    // Lan, An and Em all have 5 hours: they stay in the order of the input.
    const asc = names(await sort([{ column: 'Hours' }]));
    expect(asc.filter((n) => ['Lan', 'An', 'Em'].includes(String(n)))).toEqual(['Lan', 'An', 'Em']);
    const desc = names(await sort([{ column: 'Hours', direction: 'desc' }]));
    expect(desc.filter((n) => ['Lan', 'An', 'Em'].includes(String(n)))).toEqual(['Lan', 'An', 'Em']);
  });

  it('sorts by several keys, in the order of the list', async () => {
    expect(names(await sort([{ column: 'Dept' }, { column: 'Hours', direction: 'desc' }]))).toEqual(['Cường', 'An', 'Lan', 'Dũng', 'Bình', 'Em']);
  });

  it('puts an empty text last, and sorts dates as dates with an empty date last', async () => {
    expect(names(await sort([{ column: 'Dept' }])).at(-1)).toBe('Em');
    expect(names(await sort([{ column: 'Day' }]))).toEqual(['An', 'Cường', 'Em', 'Lan', 'Dũng', 'Bình']);
    expect(names(await sort([{ column: 'Day', direction: 'desc' }]))).toEqual(['Lan', 'Dũng', 'Cường', 'Em', 'An', 'Bình']);
  });

  it('sorts text, with the Vietnamese names as they are written', async () => {
    const r = await sort([{ column: 'Name' }]);
    expect(names(r)).toHaveLength(6);
    expect(new Set(names(r))).toEqual(new Set(names(input)));
    // The same call twice gives the same order.
    expect(names(await sort([{ column: 'Name' }]))).toEqual(names(r));
  });

  it('sorts by a formula key, and a formula can use two columns', async () => {
    // A blank number counts as 0 in a formula (the rule of the formula language), so Bình comes first; the tie of Lan and Em keeps the input order.
    expect(names(await sort([{ expression: '[Hours] * 10 + IF([Dept] = "A", 1, 0)' }]))).toEqual(['Bình', 'Dũng', 'Lan', 'Em', 'An', 'Cường']);
  });

  it('keeps the columns and the types, and the rows (no row is lost or added)', async () => {
    const r = await sort([{ column: 'Hours' }]);
    expect(r.columns).toEqual(input.columns);
    expect(r.rows).toHaveLength(input.rows.length);
  });

  it('sorts an empty table and a table of one row', async () => {
    expect((await sort([{ column: 'Hours' }], { columns: input.columns, rows: [] })).rows).toEqual([]);
    expect((await sort([{ column: 'Hours' }], { columns: input.columns, rows: [input.rows[0]!] })).rows).toHaveLength(1);
  });

  it('says what failed: no key, an unknown column (with the spelling), an invalid formula, a bad direction', async () => {
    await expect(sort([])).rejects.toThrow(/no sort key.*Add a column or a formula/);
    await expect(sort([{ column: 'hours' }])).rejects.toThrow(/"Hours"/);
    await expect(sort([{ column: 'Nope' }])).rejects.toThrow(/Available columns/);
    await expect(sort([{ expression: '[Hours] +' }])).rejects.toBeInstanceOf(EngineError);
    await expect(sort([{ column: 'Hours', direction: 'up' }])).rejects.toThrow(/asc or desc/);
  });
});

describe('parseSortKeys', () => {
  it('reads columns and formulas with a direction that defaults to ascending', () => {
    expect(parseSortKeys([{ column: 'A' }, { expression: '[A]+1', direction: 'desc' }], 'n', 'Sort')).toEqual([{ column: 'A', direction: 'asc' }, { expression: '[A]+1', direction: 'desc' }]);
    expect(parseSortKeys(undefined, 'n', 'Sort')).toEqual([]);
  });
  it('refuses a key with both or neither, an empty one, and something that is not a list', () => {
    expect(() => parseSortKeys([{ column: 'A', expression: 'x' }], 'n', 'Sort')).toThrow(/not both/);
    expect(() => parseSortKeys([{}], 'n', 'Sort')).toThrow(/not both/);
    expect(() => parseSortKeys([{ column: '' }], 'n', 'Sort')).toThrow(/empty "column"/);
    expect(() => parseSortKeys([{ expression: ' ' }], 'n', 'Sort')).toThrow(/empty "expression"/);
    expect(() => parseSortKeys('A', 'n', 'Top N')).toThrow(/Top N step "n"/);
  });
});
