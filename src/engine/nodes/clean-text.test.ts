import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import type { SqlRunner, TableData } from '../types';
import { parseCleanSettings } from './clean-text';
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
    { name: 'Other', type: 'text' },
  ],
  rows: values.map((v, i) => [i + 1, v, `o${i}`]),
});
const clean = (settings: Record<string, unknown>, values: (string | null)[]) => runNode(runner, 'clean_text', { settings: { columns: ['Text'], ...settings }, inputs: { in: table(values) } });
const texts = (t: TableData, col = 1) => t.rows.map((r) => r[col]);

// The whole Vietnamese alphabet with its tones, as lower and upper case.
const LOWER = 'aăâbcdđeêghiklmnoôơpqrstuưvxy àáảãạ ằắẳẵặ ầấẩẫậ èéẻẽẹ ềếểễệ ìíỉĩị òóỏõọ ồốổỗộ ờớởỡợ ùúủũụ ừứửữự ỳýỷỹỵ';
const PLAIN = 'aaabcddeeghiklmnooopqrstuuvxy aaaaa aaaaa aaaaa eeeee eeeee iiiii ooooo ooooo ooooo uuuuu uuuuu yyyyy';

describe('clean text node: spaces and characters', () => {
  it('trims the ends and collapses runs of spaces, by default', async () => {
    expect(texts(await clean({}, ['  a   b  ', 'c', '   ']))).toEqual(['a b', 'c', null]);
  });
  it('trim removes the spaces of Unicode at the ends (a non-breaking space too), and leaves a tab or a line break to "remove characters that do not print"', async () => {
    expect(texts(await clean({}, ['\u00a0a\u00a0', '\ta\n']))).toEqual(['a', '\ta\n']);
    expect(texts(await clean({ nonPrinting: true }, ['\ta\n']))).toEqual(['a']);
  });
  it('leaves the spaces when trim and collapse are off, and something else is on', async () => {
    expect(texts(await clean({ trim: false, collapse: false, caseMode: 'upper' }, ['  a   b  ']))).toEqual(['  A   B  ']);
    expect(texts(await clean({ trim: true, collapse: false }, ['  a   b  ']))).toEqual(['a   b']);
    expect(texts(await clean({ trim: false, collapse: true }, ['  a   b  ']))).toEqual([' a b ']);
  });
  it('turns line breaks, tabs and non-breaking spaces into a space and removes the characters that print nothing', async () => {
    const r = await clean({ nonPrinting: true }, ['a\nb\tc d\r\ne', 'x​y﻿z\u0001w', 'caf­e', 'a　b']);
    expect(texts(r)).toEqual(['a b c d e', 'xyzw', 'cafe', 'a b']);
  });
  it('does not touch those characters when the option is off', async () => {
    expect(texts(await clean({}, ['a\tb']))).toEqual(['a\tb']);
  });
});

describe('clean text node: case', () => {
  it('UPPER, lower and Proper Case, also for Vietnamese letters', async () => {
    const values = ['nguyễn văn AN', 'ĐẶNG thị hồng'];
    expect(texts(await clean({ caseMode: 'upper' }, values))).toEqual(['NGUYỄN VĂN AN', 'ĐẶNG THỊ HỒNG']);
    expect(texts(await clean({ caseMode: 'lower' }, values))).toEqual(['nguyễn văn an', 'đặng thị hồng']);
    expect(texts(await clean({ caseMode: 'proper' }, values))).toEqual(['Nguyễn Văn An', 'Đặng Thị Hồng']);
  });
  it('keeps the case by default', async () => {
    expect(texts(await clean({ trim: true }, ['aB c']))).toEqual(['aB c']);
  });
});

describe('clean text node: Vietnamese marks', () => {
  it('turns every letter of the alphabet with its tones into its base letter, with đ and Đ as d and D', async () => {
    expect(texts(await clean({ removeMarks: true }, [LOWER, LOWER.toUpperCase()]))).toEqual([PLAIN, PLAIN.toUpperCase()]);
  });
  it('gives the same result for the precomposed and the combining form of a text', async () => {
    const precomposed = 'Nguyễn Thị Hằng Đức';
    const combining = precomposed.normalize('NFD');
    expect(combining).not.toBe(precomposed);
    const r = await clean({ removeMarks: true }, [precomposed, combining, 'Ươ']);
    expect(texts(r)).toEqual(['Nguyen Thi Hang Duc', 'Nguyen Thi Hang Duc', 'Uo']);
  });
  it('removes marks and then changes the case, with trim', async () => {
    expect(texts(await clean({ removeMarks: true, caseMode: 'proper' }, ['  đỗ   VĂN  hùng ']))).toEqual(['Do Van Hung']);
  });
});

describe('clean text node: where the result goes', () => {
  it('replaces the column by default, and cleans several columns', async () => {
    const r = await runNode(runner, 'clean_text', { settings: { columns: ['Text', 'Other'], caseMode: 'upper' }, inputs: { in: table([' a ']) } });
    expect(r.columns.map((c) => c.name)).toEqual(['Id', 'Text', 'Other']);
    expect(r.rows[0]).toEqual([1, 'A', 'O0']);
  });
  it('writes new columns after the originals with a suffix, and leaves the originals as they are', async () => {
    const r = await clean({ target: 'suffix', suffix: '_c', caseMode: 'upper' }, [' ab ']);
    expect(r.columns).toEqual([{ name: 'Id', type: 'number' }, { name: 'Text', type: 'text' }, { name: 'Text_c', type: 'text' }, { name: 'Other', type: 'text' }]);
    expect(r.rows[0]).toEqual([1, ' ab ', 'AB', 'o0']);
  });
  it('keeps every row and the order', async () => {
    const r = await clean({}, ['a', null, ' b ', '']);
    expect(r.rows.map((x) => x[0])).toEqual([1, 2, 3, 4]);
  });
});

describe('clean text node: null, numbers in text, empty', () => {
  it('keeps null as null, turns a text that becomes empty into an empty cell, and leaves a number written as text alone', async () => {
    expect(texts(await clean({ caseMode: 'proper' }, [null, '   ', '', ' 007 ', '12,5']))).toEqual([null, null, null, '007', '12,5']);
  });
  it('works on an empty table', async () => {
    expect((await clean({}, [])).rows).toEqual([]);
  });
});

describe('clean text node: what is refused', () => {
  const run = (settings: Record<string, unknown>) => clean(settings, ['a']);
  it('says what to do for no column, an unknown column, a column that is not text, nothing to clean, a bad case, an empty suffix, an existing name', async () => {
    await expect(run({ columns: [] })).rejects.toThrow(/no column to clean/);
    await expect(run({ columns: ['text'] })).rejects.toThrow(/"Text"/);
    await expect(run({ columns: ['Id'] })).rejects.toThrow(/number column.*only a text column/);
    await expect(run({ trim: false, collapse: false })).rejects.toThrow(/nothing is chosen/);
    await expect(run({ caseMode: 'title' })).rejects.toThrow(/use one of/);
    await expect(run({ target: 'suffix', suffix: ' ' })).rejects.toThrow(/suffix is empty/);
    await expect(runNode(runner, 'clean_text', { settings: { columns: ['Text'], target: 'suffix', suffix: '' }, inputs: { in: table(['a']) } })).rejects.toThrow(/suffix/);
    await expect(runNode(runner, 'clean_text', { settings: { columns: ['Text'], target: 'suffix', suffix: 'X' }, inputs: { in: { columns: [{ name: 'Text', type: 'text' }, { name: 'TextX', type: 'text' }], rows: [['a', 'b']] } } })).rejects.toThrow(/"TextX" already exists/);
  });
});

describe('parseCleanSettings', () => {
  it('defaults: trim and collapse on, replace the column', () => {
    expect(parseCleanSettings({ columns: ['A'] }, 'n')).toEqual({ columns: ['A'], trim: true, collapse: true, nonPrinting: false, caseMode: 'keep', removeMarks: false, target: 'replace', suffix: '_clean' });
  });
});
