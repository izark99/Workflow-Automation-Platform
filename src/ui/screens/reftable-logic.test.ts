import { describe, expect, it } from 'vitest';
import type { Column } from '../../engine/types';
import { seedSnapshot } from '../../store/seed';
import { MAX_REF_ROWS } from '../../store/types';
import { usedByParts, columnsProblem, newTableFromPaste, planOf, reshapeGrid, pageRange, pastedCells, pasteAt, parseCell, pasteIntoGrid, rowsToText, tableSummary, textToRows, tooManyRows, usedBy, versionInEffect, versionToShow } from './reftable-logic';

const snap = seedSnapshot();
const attendance = snap.refTables.find((t) => t.name === 'Attendance codes')!;
const TODAY = '2026-11-17';
const cols: Column[] = [{ name: 'code', type: 'text' }, { name: 'hours', type: 'number' }, { name: 'since', type: 'date' }, { name: 'paid', type: 'boolean' }];

describe('summaries', () => {
  it('shows the row count and the version in effect, as the screen does', () => {
    expect(snap.refTables.map((t) => tableSummary(t, TODAY))).toEqual(['8 rows, v2 in effect', '4 rows, v1 in effect', '2 rows, v1 in effect']);
    expect(versionInEffect(attendance, '2026-03-01')?.versionNo).toBe(1);
    expect(versionInEffect(attendance, '2025-01-01')).toBeUndefined();
    expect(tableSummary(attendance, '2025-01-01')).toBe('8 rows, v2 (not in effect)');
    expect(versionToShow(attendance, TODAY)?.versionNo).toBe(2);
  });
  it('a draft only table says draft', () => {
    const t = { ...attendance, versions: [{ ...attendance.versions[1]!, status: 'draft' as const }] };
    expect(tableSummary(t, TODAY)).toBe('8 rows, v2 (draft)');
  });
  it('lists the flows that read a table', () => {
    const def = { nodes: [{ type: 'lookup_join', settings: { source: { kind: 'reference', table: 'OT limits' } } }] };
    const flows = snap.flows.map((f) => (f.id === 'flow-timesheet' ? { ...f, versions: f.versions.map((v) => ({ ...v, definition: def })) } : f));
    expect(usedBy(flows, 'OT limits')).toEqual(['Monthly timesheet summary']);
    expect(usedBy(flows, 'OT types')).toEqual([]);
  });
});

describe('cells', () => {
  it('parses by column type and says what to type', () => {
    expect(parseCell('8', cols[1]!)).toEqual({ ok: true, value: 8 });
    expect(parseCell(' 0.5 ', cols[1]!)).toEqual({ ok: true, value: 0.5 });
    expect(parseCell('', cols[1]!)).toEqual({ ok: true, value: null });
    expect(parseCell('2026-09-30', cols[2]!)).toEqual({ ok: true, value: '2026-09-30' });
    expect(parseCell('Yes', cols[3]!)).toEqual({ ok: true, value: true });
    expect(parseCell('0', cols[3]!)).toEqual({ ok: true, value: false });
    expect(parseCell(' x ', cols[0]!)).toEqual({ ok: true, value: ' x ' }); // text is kept as typed
    for (const [t, c, m] of [['abc', 1, /not a number.*8 or 0\.5/], ['30/09/2026', 2, /not a date.*2026-09-30/], ['maybe', 3, /yes or no/]] as const) {
      const r = parseCell(t, cols[c]!);
      expect(!r.ok && r.message).toMatch(m);
    }
  });
  it('a grid round trips through text, and errors name the row and the column', () => {
    const rows = [['X', 8, '2026-01-01', true], ['N', null, null, false]];
    const text = rowsToText(rows, cols);
    expect(text).toEqual([['X', '8', '2026-01-01', 'yes'], ['N', '', '', 'no']]);
    expect(textToRows(text, cols)).toEqual({ rows, errors: [] });
    const bad = textToRows([['A', '1', '', ''], ['B', 'two', 'nope', '']], cols);
    expect(bad.errors.map((e) => [e.row, e.column])).toEqual([[2, 'hours'], [2, 'since']]);
  });
  it('refuses more than 50,000 rows with the count', () => {
    expect(tooManyRows(MAX_REF_ROWS)).toBeUndefined();
    expect(tooManyRows(MAX_REF_ROWS + 1)).toMatch(/at most 50,000 rows.*50,001/);
  });
});

describe('paste into a grid', () => {
  it('without a header, cells go by position', () => {
    expect(pasteIntoGrid('X\t8\n\tN', cols)).toEqual({ ok: true, rows: [['X', '8', '', ''], ['', 'N', '', '']] });
  });
  it('with a header (any case, any order) cells go by column name and the header is skipped', () => {
    expect(pasteIntoGrid('HOURS\tCode\n8\tX\n4\tN\r\n', cols)).toEqual({ ok: true, rows: [['X', '8', '', ''], ['N', '4', '', '']] });
  });
  it('refuses too many cells, empty text and a header alone, with what to do', () => {
    expect((pasteIntoGrid('a\tb\tc\td\te', cols) as { message: string }).message).toMatch(/Row 1 of the pasted text has 5 cells, but the table has 4 columns/);
    expect((pasteIntoGrid('  \n', cols) as { message: string }).message).toMatch(/nothing to paste/);
    expect((pasteIntoGrid('code\thours', cols) as { message: string }).message).toMatch(/header row but no rows/);
  });
});

describe('a new table from Excel', () => {
  it('takes the header as column names and infers number, date and text', () => {
    const r = newTableFromPaste('code\thours\tsince\nX\t8\t2026-01-01\nN\t0.5\t2026-02-01');
    expect(r).toEqual({ ok: true, columns: [{ name: 'code', type: 'text' }, { name: 'hours', type: 'number' }, { name: 'since', type: 'date' }], rows: [['X', 8, '2026-01-01'], ['N', 0.5, '2026-02-01']] });
  });
  it('a column with mixed values or no values is text; a short row leaves blanks', () => {
    const r = newTableFromPaste('a\tb\n1\tx\n2');
    expect(r).toMatchObject({ ok: true, columns: [{ name: 'a', type: 'number' }, { name: 'b', type: 'text' }], rows: [[1, 'x'], [2, null]] });
    expect(newTableFromPaste('a\tb')).toMatchObject({ ok: true, columns: [{ type: 'text' }, { type: 'text' }], rows: [] });
  });
  it('refuses an empty header cell, a repeated name, a long row and empty text', () => {
    expect((newTableFromPaste('a\t\nx') as { message: string }).message).toMatch(/header row has an empty cell/);
    expect((newTableFromPaste('a\tA\nx') as { message: string }).message).toMatch(/"A" appears twice/);
    expect((newTableFromPaste('a\nx\ty') as { message: string }).message).toMatch(/Row 1 under the header has 2 cells/);
    expect((newTableFromPaste('') as { message: string }).message).toMatch(/nothing to paste/);
  });
});

describe('pages', () => {
  it('splits a long grid and keeps the page in range', () => {
    expect(pageRange(250, 0)).toEqual({ from: 0, to: 100, pages: 3, page: 0 });
    expect(pageRange(250, 2)).toEqual({ from: 200, to: 250, pages: 3, page: 2 });
    expect(pageRange(250, 9).page).toBe(2);
    expect(pageRange(0, 0)).toEqual({ from: 0, to: 0, pages: 1, page: 0 });
    expect(pageRange(50, -1).page).toBe(0);
  });
});

describe('paste at a cell', () => {
  it('overwrites from the cell, adds rows at the end, and drops cells beyond the last column', () => {
    const grid = [['a', '1'], ['b', '2']];
    expect(pasteAt(grid, 2, 1, 0, pastedCells('X\t9\nY\t8\nZ\t7'))).toEqual([['a', '1'], ['X', '9'], ['Y', '8'], ['Z', '7']]);
    expect(pasteAt(grid, 2, 0, 1, pastedCells('p\tq'))).toEqual([['a', 'p'], ['b', '2']]);
    expect(grid).toEqual([['a', '1'], ['b', '2']]); // the old grid is not changed
  });
});

describe('columns of a draft', () => {
  const cols: Column[] = [{ name: 'code', type: 'text' }, { name: 'limit', type: 'number' }];
  const grid = [['A', '1'], ['B', '2']];
  it('a plan starts as the columns of the version', () => {
    expect(planOf(cols)).toEqual([{ from: 0, name: 'code', type: 'text' }, { from: 1, name: 'limit', type: 'number' }]);
  });
  it('adds a column: empty cells for every row', () => {
    expect(reshapeGrid(grid, [...planOf(cols), { from: null, name: 'note', type: 'text' }])).toEqual({
      columns: [...cols, { name: 'note', type: 'text' }],
      grid: [['A', '1', ''], ['B', '2', '']],
    });
  });
  it('removes a column: its cells go, the others stay', () => {
    expect(reshapeGrid(grid, planOf(cols).slice(1))).toEqual({ columns: [{ name: 'limit', type: 'number' }], grid: [['1'], ['2']] });
  });
  it('renames a column and keeps its cells, and trims the name', () => {
    const plan = planOf(cols);
    plan[0] = { ...plan[0]!, name: '  Code of day ' };
    expect(reshapeGrid(grid, plan)).toEqual({ columns: [{ name: 'Code of day', type: 'text' }, cols[1]], grid });
  });
  it('changes the type and keeps the text, which is checked against the new type when the draft is saved', () => {
    const plan = planOf(cols);
    plan[0] = { ...plan[0]!, type: 'number' };
    const shaped = reshapeGrid(grid, plan);
    expect(shaped.columns[0]).toEqual({ name: 'code', type: 'number' });
    expect(shaped.grid).toEqual(grid);
    expect(textToRows(shaped.grid, shaped.columns).errors.length).toBeGreaterThan(0); // "A" is not a number
  });
  it('moves nothing but a column that is dropped from the middle', () => {
    const three: Column[] = [{ name: 'a', type: 'text' }, { name: 'b', type: 'text' }, { name: 'c', type: 'text' }];
    const plan = planOf(three).filter((p) => p.name !== 'b');
    expect(reshapeGrid([['1', '2', '3']], plan).grid).toEqual([['1', '3']]);
  });
  it('refuses no columns, an empty name and a name that repeats another without regard to case', () => {
    expect(columnsProblem([])).toMatchObject({ key: 'refTables.cols.problem.none' });
    expect(columnsProblem([{ from: 0, name: ' ', type: 'text' }])).toEqual({ key: 'refTables.cols.problem.empty', params: { n: 1 } });
    expect(columnsProblem([{ from: 0, name: 'Code', type: 'text' }, { from: null, name: ' code', type: 'text' }])).toEqual({ key: 'refTables.cols.problem.repeated', params: { name: 'code', first: 1, second: 2 } });
    expect(columnsProblem(planOf(cols))).toBeUndefined();
  });
});

describe('usedByParts', () => {
  it('shows three names at most, then how many more', () => {
    expect(usedByParts(['A', 'B'])).toEqual({ shown: 'A, B', more: 0 });
    expect(usedByParts(['A', 'B', 'C'])).toEqual({ shown: 'A, B, C', more: 0 });
    expect(usedByParts(['A', 'B', 'C', 'D', 'E'])).toEqual({ shown: 'A, B, C', more: 2 });
    expect(usedByParts([])).toEqual({ shown: '', more: 0 });
  });
});
