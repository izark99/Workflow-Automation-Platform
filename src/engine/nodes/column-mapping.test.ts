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

const input: TableData = {
  columns: [
    { name: 'ID', type: 'text' },
    { name: 'Hours', type: 'number' },
    { name: 'Day', type: 'date' },
    { name: 'Flag', type: 'boolean' },
    { name: 'Note', type: 'text' },
  ],
  rows: [
    ['a', 8, '2026-09-30', true, ' 12 '],
    ['b', 2.5, '2026-10-01', false, ''],
    ['c', null, null, null, null],
  ],
};

const map = (columns: unknown[], data: TableData = input) =>
  runNode(runner, 'column_mapping', { settings: { columns }, inputs: { in: data } });

describe('column mapping', () => {
  it('drops, renames and keeps the order of the grid', async () => {
    const r = await map([
      { source: 'Hours', name: 'OT hours' },
      { source: 'ID' },
      { source: 'Note', keep: false },
    ]);
    expect(r.columns.map((c) => c.name)).toEqual(['OT hours', 'ID', 'Day', 'Flag']);
    expect(r.rows[0]).toEqual([8, 'a', '2026-09-30', true]);
  });

  it('keeps columns that the grid does not list, after the listed ones', async () => {
    const r = await map([{ source: 'Day' }]);
    expect(r.columns.map((c) => c.name)).toEqual(['Day', 'ID', 'Hours', 'Flag', 'Note']);
  });

  it('converts text to number, date and boolean, and empty text to NULL', async () => {
    const data: TableData = {
      columns: [
        { name: 'N', type: 'text' },
        { name: 'D', type: 'text' },
        { name: 'B', type: 'text' },
      ],
      rows: [
        [' 12 ', '2026-09-30', 'true'],
        ['', '', ''],
      ],
    };
    const r = await map(
      [
        { source: 'N', type: 'number' },
        { source: 'D', type: 'date' },
        { source: 'B', type: 'boolean' },
      ],
      data,
    );
    expect(r.columns.map((c) => c.type)).toEqual(['number', 'date', 'boolean']);
    expect(r.rows).toEqual([
      [12, '2026-09-30', true],
      [null, null, null],
    ]);
  });

  it('converts to text without a trailing .0', async () => {
    const r = await map([
      { source: 'Hours', type: 'text' },
      { source: 'Day', type: 'text' },
      { source: 'Flag', type: 'text' },
    ]);
    expect(r.rows).toEqual([
      ['8', '2026-09-30', 'true', 'a', ' 12 '],
      ['2.5', '2026-10-01', 'false', 'b', ''],
      [null, null, null, 'c', null],
    ]);
  });

  it('converts between boolean and number', async () => {
    const r = await map([
      { source: 'Flag', type: 'number' },
      { source: 'Hours', type: 'boolean' },
    ]);
    expect(r.rows[0]?.slice(0, 2)).toEqual([1, true]);
    expect(r.rows[1]?.slice(0, 2)).toEqual([0, true]);
  });

  it('fails with the value and the column when a conversion does not work', async () => {
    const data: TableData = { columns: [{ name: 'OT', type: 'text' }], rows: [['2h']] };
    const err = await map([{ source: 'OT', type: 'number' }], data).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).code).toBe('node_failed');
    expect((err as EngineError).message).toContain('2h');
  });

  it('rejects a source column with the wrong case', async () => {
    const err = await map([{ source: 'hours' }]).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('unknown_column');
    expect((err as EngineError).message).toContain('"Hours"');
  });

  it('rejects an unsupported type change, a bad type and bad shapes', async () => {
    for (const bad of [
      [{ source: 'Hours', type: 'date' }],
      [{ source: 'Day', type: 'number' }],
      [{ source: 'Hours', type: 'integer' }],
      [{ source: 'Hours', name: '' }],
      [{ source: 'Hours', keep: 'yes' }],
      [{ source: 'Hours' }, { source: 'Hours' }],
    ]) {
      const err = await map(bad).catch((e: unknown) => e);
      expect((err as EngineError).code, JSON.stringify(bad)).toBe('invalid_settings');
    }
    const noList = await runNode(runner, 'column_mapping', { settings: {}, inputs: { in: input } }).catch((e: unknown) => e);
    expect((noList as EngineError).code).toBe('invalid_settings');
  });

  it('rejects output names that differ only by case, and an empty result', async () => {
    const dup = await map([
      { source: 'ID', name: 'x' },
      { source: 'Note', name: 'X' },
    ]).catch((e: unknown) => e);
    expect((dup as EngineError).code).toBe('invalid_settings');
    expect((dup as EngineError).message).toMatch(/case/);
    const none = await map(input.columns.map((c) => ({ source: c.name, keep: false }))).catch((e: unknown) => e);
    expect((none as EngineError).code).toBe('invalid_settings');
  });

  it('quotes names with spaces and quotes', async () => {
    const data: TableData = { columns: [{ name: 'a "b"', type: 'text' }], rows: [['x']] };
    const r = await map([{ source: 'a "b"', name: "it's" }], data);
    expect(r.columns[0]?.name).toBe("it's");
    expect(r.rows).toEqual([['x']]);
  });
});
