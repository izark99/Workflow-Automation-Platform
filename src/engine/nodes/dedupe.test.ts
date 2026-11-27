import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import type { SqlRunner, TableData } from '../types';
import { parseDedupeSettings } from './dedupe';
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
    { name: 'Id', type: 'text' },
    { name: 'Name', type: 'text' },
    { name: 'Hours', type: 'number' },
  ],
  rows: [
    ['1', 'Lan', 5],
    ['2', 'An', 5],
    ['3', 'Lan', 5],
    ['4', null, null],
    ['5', 'An', 7],
    ['6', null, null],
    ['7', 'Lan', 5],
  ],
};

const dedupe = (settings: Record<string, unknown>, handle: 'kept' | 'removed', data = input) => runNode(runner, 'dedupe', { settings, inputs: { in: data }, handle });
const ids = (t: TableData) => t.rows.map((r) => r[0]);

describe('dedupe node', () => {
  it('compares all columns by default: only a row that repeats everything is removed', async () => {
    const same: TableData = { ...input, rows: [['1', 'Lan', 5], ['1', 'Lan', 5], ['1', 'Lan', 6], ['1', 'Lan', 5]] };
    expect((await dedupe({}, 'kept', same)).rows).toEqual([['1', 'Lan', 5], ['1', 'Lan', 6]]);
    expect((await dedupe({}, 'removed', same)).rows).toEqual([['1', 'Lan', 5], ['1', 'Lan', 5]]);
  });

  it('keeps the first of the rows that share the deciding columns, and sends the others to removed', async () => {
    const settings = { columns: ['Name', 'Hours'] };
    expect(ids(await dedupe(settings, 'kept'))).toEqual(['1', '2', '4', '5']);
    expect(ids(await dedupe(settings, 'removed'))).toEqual(['3', '6', '7']);
  });

  it('keeps the last when asked, and kept still follows the order of the input', async () => {
    const settings = { columns: ['Name', 'Hours'], keep: 'last' };
    expect(ids(await dedupe(settings, 'kept'))).toEqual(['2', '5', '6', '7']);
    expect(ids(await dedupe(settings, 'removed'))).toEqual(['1', '3', '4']);
  });

  it('treats an empty value as equal to another empty value, and an empty text as empty', async () => {
    expect(ids(await dedupe({ columns: ['Name'] }, 'kept'))).toEqual(['1', '2', '4']);
    const mixed: TableData = { columns: [{ name: 'K', type: 'text' }], rows: [[null], [''], ['x'], ['']] };
    expect((await dedupe({}, 'kept', mixed)).rows).toHaveLength(2);
  });

  it('kept and removed together hold every row once, with the columns and types of the input', async () => {
    const kept = await dedupe({ columns: ['Name'] }, 'kept');
    const removed = await dedupe({ columns: ['Name'] }, 'removed');
    expect(kept.rows.length + removed.rows.length).toBe(input.rows.length);
    expect(new Set([...ids(kept), ...ids(removed)]).size).toBe(input.rows.length);
    expect(kept.columns).toEqual(input.columns);
    expect(removed.columns).toEqual(input.columns);
  });

  it('works on Vietnamese text (marks make a different value), an empty table and one row', async () => {
    const vi: TableData = { columns: [{ name: 'Name', type: 'text' }], rows: [['Hà'], ['Ha'], ['Hà'], ['Đặng'], ['Dang']] };
    expect((await dedupe({}, 'kept', vi)).rows.map((r) => r[0])).toEqual(['Hà', 'Ha', 'Đặng', 'Dang']);
    expect((await dedupe({}, 'kept', { columns: input.columns, rows: [] })).rows).toEqual([]);
    expect((await dedupe({}, 'removed', { columns: input.columns, rows: [input.rows[0]!] })).rows).toEqual([]);
  });

  it('says what failed for an unknown column, a bad keep, and columns that are not a list', async () => {
    await expect(dedupe({ columns: ['hours'] }, 'kept')).rejects.toThrow(/"Hours"/);
    await expect(dedupe({ keep: 'middle' }, 'kept')).rejects.toThrow(/first or last/);
    await expect(dedupe({ columns: 'Name' }, 'kept')).rejects.toThrow(/list of column names/);
  });
});

describe('parseDedupeSettings', () => {
  it('defaults to all columns and the first row', () => {
    expect(parseDedupeSettings({}, 'n')).toEqual({ columns: [], keep: 'first' });
  });
});
