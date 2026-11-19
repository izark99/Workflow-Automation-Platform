import { describe, expect, it } from 'vitest';
import { LIMITS_ROWS, csvFile, xlsxFile } from '../../../scripts/lib/refimport-fixtures';
import { engineText } from '../messages';
import { detectDelimiter, fileKind, guessTypes, headerNames, listSheets, nameProblems, parseCsv, prepareImport, readGrid } from './index';
import type { Grid, ImportColumn } from './index';

const text = (p: { messageId: Parameters<typeof engineText>[0]; params: Record<string, string | number> }) => engineText(p.messageId, p.params);
const grid = (rows: (string | number | boolean | Date | null)[][], typed = false): Grid => ({ rows, typed, truncated: false });

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('handles quotes, commas inside quotes, doubled quotes and line breaks inside quotes', () => {
    expect(parseCsv('name,note\n"Smith, Ann","She said ""hi"""\n"two\nlines",x\n')).toEqual([['name', 'note'], ['Smith, Ann', 'She said "hi"'], ['two\nlines', 'x']]);
  });
  it('strips a BOM and reads CRLF and CR line ends', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r1,2\r')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('keeps empty cells and an empty last cell, and has no empty row for a trailing line end', () => {
    expect(parseCsv('a,,c\n1,,\n')).toEqual([['a', '', 'c'], ['1', '', '']]);
    expect(parseCsv('a\n\n')).toEqual([['a'], ['']]);
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
  });
  it('detects a semicolon or a tab as the delimiter, ignoring delimiters inside quotes', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('"a,b,c";d')).toBe(';');
    expect(parseCsv('a;b\n1,5;2\n')).toEqual([['a', 'b'], ['1,5', '2']]);
  });
  it('stops after maxRows', () => {
    expect(parseCsv('a\nb\nc\nd\n', { maxRows: 2 })).toEqual([['a'], ['b']]);
  });
});

describe('fileKind', () => {
  it('knows xlsx and csv and refuses anything else with what to do', () => {
    expect(fileKind('Limits.XLSX')).toBe('xlsx');
    expect(fileKind('x.csv')).toBe('csv');
    expect(() => fileKind('x.xls')).toThrow('The file x.xls is not an .xlsx or .csv file. Choose a file of one of these types.');
    expect(() => fileKind('x.txt')).toThrow(/Choose a file/);
  });
});

describe('readGrid and listSheets on xlsx', () => {
  const file = xlsxFile('limits.xlsx', [
    { name: 'Limits', rows: LIMITS_ROWS },
    { name: 'Second', rows: [['x', 'y'], [1, 2]] },
  ]);
  it('lists the sheets in order, and a csv file has none', async () => {
    expect(await listSheets(file)).toEqual(['Limits', 'Second']);
    expect(await listSheets(csvFile('a.csv', 'a\n1'))).toEqual([]);
  });
  it('reads numbers, dates, booleans, text and blanks with their own types, from the first sheet or the one chosen', async () => {
    const g = await readGrid(file);
    expect(g.typed).toBe(true);
    expect(g.rows[0]).toEqual(['Code', 'Limit', 'Valid from', 'Active']);
    expect(g.rows[1]).toEqual(['A1', 12.5, new Date(Date.UTC(2026, 8, 30)), true]);
    expect(g.rows[3]?.[0]).toBe('C3');
    expect((await readGrid(file, { sheet: 'Second' })).rows).toEqual([['x', 'y'], [1, 2]]);
  });
  it('a sheet that does not exist says which sheets the file has', async () => {
    await expect(readGrid(file, { sheet: 'Nope' })).rejects.toThrow(/Sheets in this file: Limits, Second/);
  });
  it('stops at maxRows and says there are more', async () => {
    const g = await readGrid(file, { maxRows: 2 });
    expect(g.rows).toHaveLength(2);
    expect(g.truncated).toBe(true);
    expect((await readGrid(file, { maxRows: 100 })).truncated).toBe(false);
  });
  it('keeps the sheet row numbers when the sheet starts with empty rows', async () => {
    const f = xlsxFile('gap.xlsx', [{ name: 'S', rows: [[null], [null], ['h1', 'h2'], ['a', 'b']] }]);
    const g = await readGrid(f);
    expect(g.rows[2]).toEqual(['h1', 'h2']);
    expect(headerNames(g, 3)).toEqual(['h1', 'h2']);
  });
});

describe('readGrid on csv', () => {
  it('reads text cells, always', async () => {
    const g = await readGrid(csvFile('a.csv', '﻿Code,Limit\r\nA1,12.5\r\n'));
    expect(g).toEqual({ rows: [['Code', 'Limit'], ['A1', '12.5']], typed: false, truncated: false });
  });
  it('stops at maxRows', async () => {
    const g = await readGrid(csvFile('a.csv', 'a\nb\nc\nd\n'), { maxRows: 2 });
    expect(g.rows).toEqual([['a'], ['b']]);
    expect(g.truncated).toBe(true);
  });
});

describe('headerNames and guessTypes', () => {
  it('takes the names from the header row, trimmed, without trailing empty cells', () => {
    expect(headerNames(grid([['  Code ', 'Limit', '', ''], ['A', '1']]), 1)).toEqual(['Code', 'Limit']);
    expect(headerNames(grid([['x'], ['Code', 'Limit']]), 2)).toEqual(['Code', 'Limit']);
    expect(headerNames(grid([['x']]), 5)).toEqual([]);
  });
  it('guesses from the cells of an xlsx file: number, date, boolean, text; a mix is text; all blank is text', () => {
    const g = await0();
    expect(guessTypes(g, 1, 6)).toEqual(['text', 'number', 'date', 'boolean', 'text', 'text']);
  });
  it('guesses from the text of a csv file', () => {
    const g = grid([['a', 'b', 'c', 'd', 'e'], ['1', 'true', '2026-09-30', 'x', ''], ['2.5', 'FALSE', '2026-10-01', '1', ''], ['-3', '', '', '', '']]);
    expect(guessTypes(g, 1, 5)).toEqual(['number', 'boolean', 'date', 'text', 'text']);
  });
  it('a date that is not a real date makes the column text', () => {
    expect(guessTypes(grid([['d'], ['2026-02-30']]), 1, 1)).toEqual(['text']);
  });
  it('looks only at the first 1,000 filled cells', () => {
    const rows: (string | number)[][] = [['n']];
    for (let i = 0; i < 1000; i++) rows.push([i]);
    rows.push(['text after the limit']);
    expect(guessTypes(grid(rows, true), 1, 1)).toEqual(['number']);
  });
  it('blank cells do not count toward the 1,000', () => {
    const rows: (string | number | null)[][] = [['n']];
    for (let i = 0; i < 2000; i++) rows.push([null]);
    rows.push([5]);
    expect(guessTypes(grid(rows, true), 1, 1)).toEqual(['number']);
  });
});
function await0(): Grid {
  return grid([['t', 'n', 'd', 'b', 'mixed', 'blank'], ['x', 1, new Date(Date.UTC(2026, 8, 30)), true, 1, null], ['y', 2.5, new Date(Date.UTC(2026, 9, 1)), false, 'two', null]], true);
}

describe('nameProblems', () => {
  it('refuses an empty name and a name that repeats another without regard to case', () => {
    expect(nameProblems(['Code', '', 'code']).map(text)).toEqual([
      'Column 2 has no name in the header row. Type a name in that cell, or remove the column.',
      'The name "code" is used by columns 1 and 3 (names are compared without regard to case). Give each column its own name.',
    ]);
    expect(nameProblems(['a', 'b'])).toEqual([]);
  });
});

describe('prepareImport', () => {
  const cols = (...types: ImportColumn['type'][]): ImportColumn[] => types.map((type, i) => ({ name: `c${i + 1}`, type }));
  it('converts the cells of an xlsx file to typed values: ISO dates, numbers, booleans and null for blanks', () => {
    const g = grid(LIMITS_ROWS, true);
    const r = prepareImport(g, 1, [{ name: 'Code', type: 'text' }, { name: 'Limit', type: 'number' }, { name: 'Valid from', type: 'date' }, { name: 'Active', type: 'boolean' }]);
    expect(r).toEqual({
      ok: true,
      columns: [{ name: 'Code', type: 'text' }, { name: 'Limit', type: 'number' }, { name: 'Valid from', type: 'date' }, { name: 'Active', type: 'boolean' }],
      rows: [['A1', 12.5, '2026-09-30', true], ['B2', 40, '2026-10-01', false], ['C3', null, null, null]],
    });
  });
  it('converts the text of a csv file by the chosen types, and skips rows of blank cells', () => {
    const g = grid([['a', 'b', 'c'], ['1', '2026-09-30', 'TRUE'], ['', '', ''], [' 2.5 ', '', 'false']]);
    const r = prepareImport(g, 1, cols('number', 'date', 'boolean'));
    expect(r).toMatchObject({ ok: true, rows: [[1, '2026-09-30', true], [2.5, null, false]] });
  });
  it('a column of type text keeps what is there, also numbers, dates and booleans of an xlsx file', () => {
    const g = grid([['t'], [7], [true], [new Date(Date.UTC(2026, 0, 2))], ['007']], true);
    expect(prepareImport(g, 1, cols('text'))).toMatchObject({ ok: true, rows: [['7'], ['true'], ['2026-01-02'], ['007']] });
  });
  it('a cell that does not fit names the row and the column and says what to do', () => {
    const g = grid([['Code', 'Limit', 'When', 'Flag'], ['A', 'abc', '2026-09-30', 'true'], ['B', '4', '30/09/2026', 'maybe']]);
    const r = prepareImport(g, 1, [{ name: 'Code', type: 'text' }, { name: 'Limit', type: 'number' }, { name: 'When', type: 'date' }, { name: 'Flag', type: 'boolean' }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problemCount).toBe(3);
    expect(r.problems.map(text)).toEqual([
      'Row 2, column Limit: "abc" is not a number. Fix the cell, or set the type of the column to text.',
      'Row 3, column When: "30/09/2026" is not a date such as 2026-09-30. Fix the file, or choose the type text for the column.',
      'Row 3, column Flag: "maybe" is not true or false. Fix the cell, or set the type of the column to text.',
    ]);
  });
  it('the row number is the row of the sheet, so a header on row 3 counts from there', () => {
    const g = grid([[], [], ['n'], ['1'], ['x']]);
    const r = prepareImport(g, 3, [{ name: 'n', type: 'number' }]);
    expect(r.ok === false && r.problems.map(text)).toEqual(['Row 5, column n: "x" is not a number. Fix the cell, or set the type of the column to text.']);
  });
  it('an Excel date with a time of day is the date in UTC; 2026-02-30 is not a date', () => {
    expect(prepareImport(grid([['d'], [new Date(Date.UTC(2026, 8, 30, 15))]], true), 1, cols('date'))).toMatchObject({ ok: true, rows: [['2026-09-30']] });
    expect(prepareImport(grid([['d'], ['2026-02-30']]), 1, cols('date'))).toMatchObject({ ok: false });
  });
  it('refuses a header row that is past the end, and a header row without names', () => {
    expect(prepareImport(grid([['a']]), 4, cols('text'))).toMatchObject({ ok: false });
    const r = prepareImport(grid([['a']]), 1, []);
    expect(r.ok === false && r.problems.map(text)).toEqual(['The header row 1 has no column names. Type the number of the row that holds the column names.']);
    const past = prepareImport(grid([['a']]), 4, cols('text'));
    expect(past.ok === false && past.problems.map(text)).toEqual(['The header row 4 is empty or past the end of the sheet. Type the number of the row that holds the column names.']);
  });
  it('refuses an empty or repeated column name', () => {
    const r = prepareImport(grid([['a'], ['1']]), 1, [{ name: 'A', type: 'text' }, { name: ' a ', type: 'text' }, { name: '', type: 'text' }]);
    expect(r.ok === false && r.problems.map(text)).toEqual([
      'The name "a" is used by columns 1 and 2 (names are compared without regard to case). Give each column its own name.',
      'Column 3 has no name in the header row. Type a name in that cell, or remove the column.',
    ]);
  });
  it('allows 100 columns and refuses 101', () => {
    const names = (n: number): ImportColumn[] => Array.from({ length: n }, (_, i) => ({ name: `c${i}`, type: 'text' as const }));
    const g = grid([Array.from({ length: 101 }, (_, i) => `c${i}`), Array.from({ length: 101 }, () => 'x')]);
    expect(prepareImport(g, 1, names(100)).ok).toBe(true);
    const r = prepareImport(g, 1, names(101));
    expect(r.ok === false && r.problems.map(text)).toEqual(['The file has 101 columns, and a table holds at most 100. Remove the columns that are not needed, then import again.']);
  });
  it('allows 50,000 rows and refuses 50,001', () => {
    const rows = (n: number) => [['v'], ...Array.from({ length: n }, (_, i) => [String(i)])];
    expect(prepareImport(grid(rows(50_000)), 1, cols('number')).ok).toBe(true);
    const r = prepareImport(grid(rows(50_001)), 1, cols('number'));
    expect(r.ok === false && r.problems.map(text)).toEqual(['The file has 50,001 rows of data, and a table holds at most 50,000. Split the file into smaller files, or remove the rows that are not needed.']);
  });
  it('a file that was cut at the row limit is refused without saying how many rows it has', () => {
    const g: Grid = { rows: [['v'], ['1']], typed: false, truncated: true };
    const r = prepareImport(g, 1, cols('number'));
    expect(r.ok === false && r.problems.map(text)[0]).toContain('more than 50,000 rows of data');
  });
  it('keeps only the first problems but counts all of them', () => {
    const rows = [['n'], ...Array.from({ length: 200 }, () => ['x'])];
    const r = prepareImport(grid(rows), 1, cols('number'));
    expect(r.ok === false && [r.problems.length, r.problemCount]).toEqual([50, 200]);
  });
});
