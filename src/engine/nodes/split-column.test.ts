import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import type { SqlRunner, TableData } from '../types';
import { parseSplitSettings } from './split-column';
import { runNode } from './test-helpers';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const table = (values: (string | null)[]): TableData => ({
  columns: [
    { name: 'Id', type: 'number' },
    { name: 'Text', type: 'text' },
    { name: 'After', type: 'text' },
  ],
  rows: values.map((v, i) => [i + 1, v, 'z']),
});

const split = (settings: Record<string, unknown>, values: (string | null)[]) => runNode(runner, 'split_column', { settings: { column: 'Text', ...settings }, inputs: { in: table(values) } });
const cells = (t: TableData, from: number, to: number) => t.rows.map((r) => r.slice(from, to));

describe('split column node: the Vietnamese name, cut at the last space', () => {
  const names = ['Nguyễn Văn An', 'Đặng Thị Hồng Nhung', 'Lê  Minh', 'Phạm Dũng', 'Bình', '  Trần Hà  ', '', null];
  it('puts the family and middle names and the given name in two columns', async () => {
    const r = await split({ cut: 'last_space', names: ['Họ và tên đệm', 'Tên'] }, names);
    expect(cells(r, 1, 3)).toEqual([
      ['Nguyễn Văn', 'An'],
      ['Đặng Thị Hồng', 'Nhung'],
      ['Lê', 'Minh'],
      ['Phạm', 'Dũng'],
      ['Bình', null],
      ['Trần', 'Hà'],
      [null, null],
      [null, null],
    ]);
  });
  it('puts the new columns in the place of the original, drops it by default, and they are text', async () => {
    const r = await split({ cut: 'last_space', names: ['Family', 'Given'] }, names);
    expect(r.columns.map((c) => c.name)).toEqual(['Id', 'Family', 'Given', 'After']);
    expect(r.columns[1]).toEqual({ name: 'Family', type: 'text' });
    expect(r.rows.map((r2) => r2[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('keeps the original column when asked, in front of the new ones', async () => {
    const r = await split({ cut: 'last_space', names: ['Family', 'Given'], keepOriginal: true }, ['Nguyễn Văn An']);
    expect(r.columns.map((c) => c.name)).toEqual(['Id', 'Text', 'Family', 'Given', 'After']);
    expect(r.rows[0]).toEqual([1, 'Nguyễn Văn An', 'Nguyễn Văn', 'An', 'z']);
  });
});

describe('split column node: the other cuts', () => {
  it('cuts at the first space, and the rest stays in one part', async () => {
    const r = await split({ cut: 'first_space', names: ['First', 'Rest'] }, ['Anna Maria Lopez', 'Solo', ' a b ']);
    expect(cells(r, 1, 3)).toEqual([['Anna', 'Maria Lopez'], ['Solo', null], ['a', 'b']]);
  });

  it('cuts at every comma, semicolon, space and tab, and at a given text', async () => {
    expect(cells(await split({ cut: 'comma', names: ['A', 'B', 'C'] }, ['x,y,z']), 1, 4)).toEqual([['x', 'y', 'z']]);
    expect(cells(await split({ cut: 'semicolon', names: ['A', 'B'] }, ['x;y']), 1, 3)).toEqual([['x', 'y']]);
    expect(cells(await split({ cut: 'space', names: ['A', 'B', 'C'] }, ['x y z']), 1, 4)).toEqual([['x', 'y', 'z']]);
    expect(cells(await split({ cut: 'tab', names: ['A', 'B'] }, ['x\ty']), 1, 3)).toEqual([['x', 'y']]);
    expect(cells(await split({ cut: 'text', separator: ' - ', names: ['A', 'B'] }, ['2026 - 09']), 1, 3)).toEqual([['2026', '09']]);
    // The given text is a plain text, not a pattern.
    expect(cells(await split({ cut: 'text', separator: '.', names: ['A', 'B'] }, ['a.b', 'axb']), 1, 3)).toEqual([['a', 'b'], ['axb', null]]);
  });

  it('puts the rest of the text in the last column, or drops it', async () => {
    expect(cells(await split({ cut: 'comma', names: ['A', 'B'] }, ['1,2,3,4']), 1, 3)).toEqual([['1', '2,3,4']]);
    expect(cells(await split({ cut: 'comma', names: ['A', 'B'], rest: 'drop' }, ['1,2,3,4']), 1, 3)).toEqual([['1', '2']]);
    expect(cells(await split({ cut: 'space', names: ['A'] }, ['a b c']), 1, 2)).toEqual([['a b c']]);
    expect(cells(await split({ cut: 'space', names: ['A'], rest: 'drop' }, ['a b c']), 1, 2)).toEqual([['a']]);
  });

  it('leaves a part that is missing empty, and an empty part is empty (not an empty text)', async () => {
    expect(cells(await split({ cut: 'comma', names: ['A', 'B', 'C'] }, ['x']), 1, 4)).toEqual([['x', null, null]]);
    expect(cells(await split({ cut: 'comma', names: ['A', 'B', 'C'] }, ['x,,z']), 1, 4)).toEqual([['x', null, 'z']]);
  });

  it('trims the parts unless trim is off', async () => {
    expect(cells(await split({ cut: 'comma', names: ['A', 'B'] }, [' x , y ']), 1, 3)).toEqual([['x', 'y']]);
    expect(cells(await split({ cut: 'comma', names: ['A', 'B'], trim: false }, [' x , y ']), 1, 3)).toEqual([[' x ', ' y ']]);
  });

  it('gives empty parts for an empty or null text, and the text itself when there is no separator in it', async () => {
    const r = await split({ cut: 'comma', names: ['A', 'B'] }, ['', null, 'no comma here']);
    expect(cells(r, 1, 3)).toEqual([[null, null], [null, null], ['no comma here', null]]);
  });

  it('keeps every row and the other columns as they were', async () => {
    const r = await split({ cut: 'space', names: ['A', 'B'] }, ['a b', 'c d']);
    expect(r.rows.map((x) => [x[0], x[3]])).toEqual([[1, 'z'], [2, 'z']]);
  });
});

describe('split column node: what is refused', () => {
  const run = (settings: Record<string, unknown>) => split(settings, ['a b']);
  it('a new name that exists is an error that names it; the name of the dropped original is free', async () => {
    await expect(run({ cut: 'space', names: ['Id', 'B'] })).rejects.toThrow(/column named "Id" already exists/);
    await expect(run({ cut: 'space', names: ['A', 'After'] })).rejects.toThrow(/"After"/);
    await expect(run({ cut: 'space', names: ['Text', 'B'], keepOriginal: true })).rejects.toThrow(/"Text"/);
    expect((await run({ cut: 'space', names: ['Text', 'B'] })).columns.map((c) => c.name)).toEqual(['Id', 'Text', 'B', 'After']);
  });
  it('says what to do for no column, an unknown column, a column that is not text, no names, twice the same name, a missing text', async () => {
    await expect(run({ column: '', names: ['A'] })).rejects.toThrow(/no column to split/);
    await expect(run({ column: 'text', names: ['A'] })).rejects.toThrow(/"Text"/);
    await expect(run({ column: 'Id', names: ['A'] })).rejects.toThrow(/number column.*only a text column/);
    await expect(run({ names: [] })).rejects.toThrow(/no name for a new column/);
    await expect(run({ names: ['A', 'A'] })).rejects.toThrow(/used twice/);
    await expect(run({ names: ['A', ' '] })).rejects.toThrow(/empty name/);
    await expect(run({ cut: 'text', separator: '', names: ['A'] })).rejects.toThrow(/text to cut at/);
    await expect(run({ cut: 'dash', names: ['A'] })).rejects.toThrow(/use one of/);
  });
});

describe('parseSplitSettings', () => {
  it('defaults: cut at the space, the rest in the last part, trim on, original dropped', () => {
    expect(parseSplitSettings({ column: 'C', names: ['A'] }, 'n')).toEqual({ column: 'C', cut: 'space', separator: '', names: ['A'], rest: 'last', trim: true, keepOriginal: false });
  });
});
