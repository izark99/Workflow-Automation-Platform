import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EngineError, type Cell, type SqlRunner, type TableData } from '../types';
import { createNodeRunner } from '../runner/node-runner';
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
    { name: 'Team', type: 'text' },
    { name: 'Week', type: 'number' },
    { name: 'Hours', type: 'number' },
    { name: 'Day', type: 'date' },
  ],
  rows: [
    ['b', 2, 4, '2026-09-10'],
    ['a', 1, 3, '2026-09-02'],
    ['a', 1, 5, '2026-09-01'],
    ['b', 1, null, '2026-09-03'],
    ['a', 2, 2, null],
    [null, 1, 7, '2026-09-04'],
  ],
};

const group = (settings: Record<string, unknown>, data: TableData = input) =>
  runNode(runner, 'group_by', { settings, inputs: { in: data } });
const col = (t: TableData, i: number): Cell[] => t.rows.map((r) => r[i] ?? null);

describe('group by node', () => {
  it('groups, aggregates, and sorts the result by the group columns', async () => {
    const r = await group({
      groupBy: ['Team'],
      aggregations: [
        { fn: 'sum', column: 'Hours', as: 'Total' },
        { fn: 'count', as: 'Rows' },
      ],
    });
    expect(r.columns).toEqual([
      { name: 'Team', type: 'text' },
      { name: 'Total', type: 'number' },
      { name: 'Rows', type: 'number' },
    ]);
    expect(r.rows).toEqual([
      ['a', 10, 3],
      ['b', 4, 2],
      [null, 7, 1],
    ]);
  });

  it('groups by several columns in the order given', async () => {
    const r = await group({ groupBy: ['Team', 'Week'], aggregations: [{ fn: 'sum', column: 'Hours', as: 'T' }] });
    expect(r.rows).toEqual([
      ['a', 1, 8],
      ['a', 2, 2],
      ['b', 1, 0],
      ['b', 2, 4],
      [null, 1, 7],
    ]);
  });

  it('counts rows, or the filled cells of a column', async () => {
    const r = await group({
      groupBy: ['Team'],
      aggregations: [
        { fn: 'count', as: 'Rows' },
        { fn: 'count', column: 'Hours', as: 'Filled' },
        { fn: 'count', column: 'Day', as: 'Dated' },
      ],
    });
    expect(r.rows).toEqual([
      ['a', 3, 3, 2],
      ['b', 2, 1, 2],
      [null, 1, 1, 1],
    ]);
  });

  it('ignores blanks in average, min and max, and gives 0 for a sum of blanks', async () => {
    const r = await group({
      groupBy: ['Team'],
      aggregations: [
        { fn: 'average', column: 'Hours', as: 'Avg' },
        { fn: 'min', column: 'Hours', as: 'Min' },
        { fn: 'max', column: 'Hours', as: 'Max' },
        { fn: 'sum', column: 'Hours', as: 'Sum' },
      ],
    }).then((t) => ({ ...t, rows: t.rows.filter((row) => row[0] === 'a' || row[0] === 'b') }));
    expect(r.rows).toEqual([
      ['a', 10 / 3, 2, 5, 10],
      ['b', 4, 4, 4, 4],
    ]);
    const blank: TableData = { columns: [{ name: 'k', type: 'text' }, { name: 'v', type: 'number' }], rows: [['x', null]] };
    const b = await group({ groupBy: ['k'], aggregations: [{ fn: 'sum', column: 'v', as: 's' }, { fn: 'average', column: 'v', as: 'a' }] }, blank);
    expect(b.rows).toEqual([['x', 0, null]]);
  });

  it('takes min and max of dates and text, and keeps the type', async () => {
    const r = await group({
      groupBy: ['Week'],
      aggregations: [
        { fn: 'min', column: 'Day', as: 'First' },
        { fn: 'max', column: 'Team', as: 'LastTeam' },
      ],
    });
    expect(r.columns.map((c) => c.type)).toEqual(['number', 'date', 'text']);
    expect(col(r, 1)).toEqual(['2026-09-01', '2026-09-10']);
    expect(col(r, 2)).toEqual(['b', 'b']);
  });

  it('gives one row for the whole table when no group column is set', async () => {
    const r = await group({ aggregations: [{ fn: 'sum', column: 'Hours', as: 'All' }, { fn: 'count', as: 'N' }] });
    expect(r.rows).toEqual([[21, 6]]);
  });

  it('works as a distinct list when there is no aggregation', async () => {
    const r = await group({ groupBy: ['Team'] });
    expect(col(r, 0)).toEqual(['a', 'b', null]);
  });

  it('names the result columns after the function when no name is given', async () => {
    const r = await group({ groupBy: ['Team'], aggregations: [{ fn: 'sum', column: 'Hours' }, { fn: 'count' }] });
    expect(r.columns.map((c) => c.name)).toEqual(['Team', 'sum_Hours', 'count']);
  });

  it('checks column names with their case and the type of each function', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ groupBy: ['team'], aggregations: [] }, 'unknown_column'],
      [{ groupBy: ['Team'], aggregations: [{ fn: 'sum', column: 'hours', as: 'x' }] }, 'unknown_column'],
      [{ groupBy: ['Team'], aggregations: [{ fn: 'sum', column: 'Team', as: 'x' }] }, 'invalid_settings'],
      [{ groupBy: ['Team'], aggregations: [{ fn: 'average', column: 'Day', as: 'x' }] }, 'invalid_settings'],
      [{ groupBy: ['Team'], aggregations: [{ fn: 'median', column: 'Hours', as: 'x' }] }, 'invalid_settings'],
      [{ groupBy: ['Team'], aggregations: [{ fn: 'sum', as: 'x' }] }, 'invalid_settings'],
    ];
    for (const [settings, code] of cases) {
      const err = await group(settings).catch((e: unknown) => e);
      expect(err, JSON.stringify(settings)).toBeInstanceOf(EngineError);
      expect((err as EngineError).code, JSON.stringify(settings)).toBe(code);
    }
  });

  it('refuses duplicate output names, also by case only, and an empty setup', async () => {
    const dup = await group({ groupBy: ['Team'], aggregations: [{ fn: 'sum', column: 'Hours', as: 'team' }] }).catch((e: unknown) => e);
    expect((dup as EngineError).code).toBe('invalid_settings');
    const twice = await group({ groupBy: ['Team', 'Team'], aggregations: [] }).catch((e: unknown) => e);
    expect((twice as EngineError).code).toBe('invalid_settings');
    for (const bad of [{}, { groupBy: [], aggregations: [] }, { groupBy: 'Team' }, { groupBy: ['Team'], aggregations: 'sum' }]) {
      const err = await group(bad).catch((e: unknown) => e);
      expect((err as EngineError).code, JSON.stringify(bad)).toBe('invalid_settings');
    }
  });
});
