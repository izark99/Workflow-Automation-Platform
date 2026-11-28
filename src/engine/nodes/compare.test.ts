import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import type { SqlRunner, TableData } from '../types';
import { parseCompareSettings } from './compare';
import { runNode } from './test-helpers';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const cols = (...c: [string, 'text' | 'number' | 'date'][]) => c.map(([name, type]) => ({ name, type }));

// Last month and this month of a timesheet.
const oldTable: TableData = {
  columns: cols(['Id', 'text'], ['Name', 'text'], ['Hours', 'number'], ['Day', 'date']),
  rows: [
    ['E1', 'Lan', 8, '2026-09-01'],
    ['E2', 'An', 5, '2026-09-02'],
    ['E3', 'Bình', 7, null],
    ['E4', 'Dũng', 6, '2026-09-04'],
    ['E5', null, 4, '2026-09-05'],
  ],
};
const newTable: TableData = {
  columns: cols(['Id', 'text'], ['Name', 'text'], ['Hours', 'number'], ['Day', 'date']),
  rows: [
    ['E1', 'Lan', 8, '2026-09-01'], // the same
    ['E2', 'An', 9, '2026-09-02'], // Hours changed
    ['E3', 'Bình', 7, '2026-09-03'], // Day was empty
    ['E5', '', 4, '2026-09-05'], // Name was empty: an empty text equals an empty value
    ['E6', 'Hà', 3, '2026-09-06'], // new
  ],
};

const compare = (settings: Record<string, unknown>, handle: 'added' | 'removed' | 'changed', n = newTable, o = oldTable) =>
  runNode(runner, 'compare', { settings, inputs: { new: n, old: o }, handle });
const keys = { keys: [{ new: 'Id', old: 'Id' }] };
const ids = (t: TableData) => t.rows.map((r) => r[0]);

describe('compare node: added, removed, changed', () => {
  it('added holds the rows of the new table whose key the old one lacks, with the columns of the new table', async () => {
    const r = await compare(keys, 'added');
    expect(r.rows).toEqual([['E6', 'Hà', 3, '2026-09-06']]);
    expect(r.columns).toEqual(newTable.columns);
  });
  it('removed holds the rows of the old table whose key the new one lacks, with the columns of the old table', async () => {
    const r = await compare(keys, 'removed');
    expect(r.rows).toEqual([['E4', 'Dũng', 6, '2026-09-04']]);
    expect(r.columns).toEqual(oldTable.columns);
  });
  it('changed holds the keys, the names of the changed columns, and the new and the old value of every compared column', async () => {
    const r = await compare(keys, 'changed');
    expect(r.columns.map((c) => c.name)).toEqual(['Id', 'Changed columns', 'Name', 'Name (old)', 'Hours', 'Hours (old)', 'Day', 'Day (old)']);
    expect(r.rows).toEqual([
      ['E2', 'Hours', 'An', 'An', 9, 5, '2026-09-02', '2026-09-02'],
      ['E3', 'Day', 'Bình', 'Bình', 7, 7, '2026-09-03', null],
    ]);
    expect(r.columns.map((c) => c.type)).toEqual(['text', 'text', 'text', 'text', 'number', 'number', 'date', 'date']);
  });
  it('lists every column that changed in one row, joined by a comma, in the order of the columns', async () => {
    const n: TableData = { columns: oldTable.columns, rows: [['E1', 'Lan Anh', 10, '2026-09-09']] };
    const r = await compare(keys, 'changed', n, { columns: oldTable.columns, rows: [oldTable.rows[0]!] });
    expect(r.rows[0]![1]).toBe('Name, Hours, Day');
  });
  it('keeps the order of the new table in changed and added, and of the old table in removed', async () => {
    const n: TableData = { columns: oldTable.columns, rows: [['E9', 'x', 1, null], ['E8', 'y', 2, null], ['E5', 'z', 4, '2026-09-05']] };
    expect(ids(await compare(keys, 'added', n))).toEqual(['E9', 'E8']);
    expect(ids(await compare(keys, 'changed', n))).toEqual(['E5']);
    expect(ids(await compare(keys, 'removed', n))).toEqual(['E1', 'E2', 'E3', 'E4']);
  });
  it('compares an empty value to an empty value as equal, and an empty text to an empty cell', async () => {
    // E5: Name is empty in both (null and an empty text): not a change.
    expect(ids(await compare(keys, 'changed'))).not.toContain('E5');
  });
});

describe('compare node: typed values, keys and columns', () => {
  it('compares numbers as numbers: 5 and 5.0 are equal, and dates as dates', async () => {
    const o: TableData = { columns: cols(['Id', 'text'], ['V', 'number'], ['D', 'date']), rows: [['a', 5, '2026-09-01']] };
    const n: TableData = { columns: o.columns, rows: [['a', 5.0, '2026-09-01']] };
    expect((await compare(keys, 'changed', n, o)).rows).toEqual([]);
  });
  it('compares only the listed columns when some are listed, and names a key of each table when they are called differently', async () => {
    const r = await compare({ ...keys, compare: ['Hours'] }, 'changed');
    expect(r.columns.map((c) => c.name)).toEqual(['Id', 'Changed columns', 'Hours', 'Hours (old)']);
    expect(ids(r)).toEqual(['E2']);
    const o: TableData = { columns: cols(['Code', 'text'], ['Hours', 'number']), rows: [['a', 1], ['b', 2]] };
    const n: TableData = { columns: cols(['Id', 'text'], ['Hours', 'number']), rows: [['a', 1], ['b', 3], ['c', 4]] };
    const settings = { keys: [{ new: 'Id', old: 'Code' }] };
    expect(ids(await compare(settings, 'changed', n, o))).toEqual(['b']);
    expect(ids(await compare(settings, 'added', n, o))).toEqual(['c']);
    expect((await compare(settings, 'changed', n, o)).columns[0]!.name).toBe('Id');
  });
  it('does not compare a column that exists on one side only', async () => {
    const n: TableData = { columns: cols(['Id', 'text'], ['Hours', 'number'], ['Extra', 'text']), rows: [['a', 1, 'x']] };
    const o: TableData = { columns: cols(['Id', 'text'], ['Hours', 'number'], ['Gone', 'text']), rows: [['a', 1, 'y']] };
    const r = await compare(keys, 'changed', n, o);
    expect(r.rows).toEqual([]);
    expect(r.columns.map((c) => c.name)).toEqual(['Id', 'Changed columns', 'Hours', 'Hours (old)']);
  });
  it('matches on several key columns', async () => {
    const o: TableData = { columns: cols(['Dept', 'text'], ['Id', 'text'], ['V', 'number']), rows: [['A', '1', 1], ['B', '1', 2]] };
    const n: TableData = { columns: o.columns, rows: [['A', '1', 1], ['B', '1', 3], ['B', '2', 4]] };
    const settings = { keys: [{ new: 'Dept', old: 'Dept' }, { new: 'Id', old: 'Id' }] };
    expect((await compare(settings, 'changed', n, o)).rows).toEqual([['B', '1', 'V', 3, 2]]);
    expect((await compare(settings, 'added', n, o)).rows).toEqual([['B', '2', 4]]);
  });
  it('matches empty keys with each other, and works on empty tables', async () => {
    const o: TableData = { columns: cols(['Id', 'text'], ['V', 'number']), rows: [[null, 1]] };
    const n: TableData = { columns: o.columns, rows: [['', 2]] };
    // The key shows the value of the new table (an empty text), and it matched the empty cell of the old table.
    expect((await compare(keys, 'changed', n, o)).rows).toEqual([['', 'V', 2, 1]]);
    expect((await compare(keys, 'added', { columns: o.columns, rows: [] }, { columns: o.columns, rows: [] })).rows).toEqual([]);
  });
  it('every row of the new table is in exactly one of added, changed or unchanged, and the same for the old table', async () => {
    const added = (await compare(keys, 'added')).rows.length;
    const changed = (await compare(keys, 'changed')).rows.length;
    const removed = (await compare(keys, 'removed')).rows.length;
    const unchanged = newTable.rows.length - added - changed;
    expect(unchanged).toBe(oldTable.rows.length - removed - changed);
    expect(unchanged).toBe(2);
  });
});

describe('compare node: what is refused', () => {
  const run = (settings: Record<string, unknown>, n = newTable, o = oldTable) => compare(settings, 'changed', n, o);
  it('a repeated key stops the run and names the key, the table and how often', async () => {
    const dup: TableData = { columns: newTable.columns, rows: [['E1', 'a', 1, null], ['E2', 'b', 2, null], ['E1', 'c', 3, null]] };
    await expect(run(keys, dup)).rejects.toThrow(/key E1 appears 2 times in the new table.*Remove duplicates/);
    await expect(run(keys, newTable, dup)).rejects.toThrow(/key E1 appears 2 times in the old table/);
    const empties: TableData = { columns: newTable.columns, rows: [[null, 'a', 1, null], ['', 'b', 2, null]] };
    await expect(run(keys, empties)).rejects.toThrow(/key \(empty\) appears 2 times/);
  });
  it('says what to do for no key, an unknown key column, keys of different types, a column of different types, a key in the compared list', async () => {
    await expect(run({ keys: [] })).rejects.toThrow(/no key\. Choose the column/);
    await expect(run({ keys: [{ new: 'id', old: 'Id' }] })).rejects.toThrow(/"Id"/);
    await expect(run({ keys: [{ new: 'Id', old: 'Hours' }] })).rejects.toThrow(/keys cannot be matched/);
    const text: TableData = { columns: cols(['Id', 'text'], ['Name', 'text'], ['Hours', 'text'], ['Day', 'date']), rows: [] };
    await expect(run(keys, newTable, text)).rejects.toThrow(/"Hours" is a number column in the new table and a text column in the old table/);
    await expect(run({ ...keys, compare: ['Id'] })).rejects.toThrow(/"Id" is a key column/);
    await expect(run({ ...keys, compare: ['Nope'] })).rejects.toThrow(/"Nope" is not in the new table/);
    await expect(run({ ...keys, compare: ['Hours'] }, newTable, { columns: cols(['Id', 'text']), rows: [] })).rejects.toThrow(/not in the old table/);
  });
  it('refuses a result that would have two columns with one name', async () => {
    const n: TableData = { columns: cols(['Id', 'text'], ['Changed columns', 'text']), rows: [['a', 'x']] };
    await expect(run(keys, n, n)).rejects.toThrow(/two columns named "Changed columns"/);
  });
});

describe('parseCompareSettings', () => {
  it('reads the key pairs and the columns to compare', () => {
    expect(parseCompareSettings({ keys: [{ new: 'A', old: 'B' }], compare: ['X'] }, 'n')).toEqual({ keys: [{ new: 'A', old: 'B' }], compare: ['X'] });
    expect(parseCompareSettings({ keys: [{ new: 'A', old: 'B' }] }, 'n').compare).toEqual([]);
  });
  it('refuses a key without both columns', () => {
    expect(() => parseCompareSettings({ keys: [{ new: 'A' }] }, 'n')).toThrow(/a column of the new table and a column of the old table/);
    expect(() => parseCompareSettings({ keys: ['A'] }, 'n')).toThrow(/"new" column and an "old" column/);
  });
});
