import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { compareWorkbooks, formatComparison, readWorkbook } from './compare-workbooks';

type Rows = unknown[][];

/** Builds a workbook and reads it back, so the test sees what a file on disk gives. */
function book(sheets: Record<string, Rows>, order = Object.keys(sheets)) {
  const wb = XLSX.utils.book_new();
  for (const name of order) {
    const ws = XLSX.utils.aoa_to_sheet(sheets[name]!, { cellDates: true });
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }) as ArrayBuffer;
  return readWorkbook(new Uint8Array(bytes));
}

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const base = (): Record<string, Rows> => ({
  A: [
    ['id', 'n', 'when', 'flag', 'note'],
    ['x', 1.5, day(2026, 9, 30), true, 'hello'],
    ['y', 2, day(2026, 10, 1), false, null],
  ],
  B: [['k'], ['v']],
});
const compare = (actual: Record<string, Rows>, sheets = ['A', 'B'], expected = base()) =>
  compareWorkbooks(book(expected), book(actual), sheets);

describe('compareWorkbooks: equal workbooks', () => {
  it('passes and counts the cells it compared', () => {
    const r = compare(base());
    expect(r.ok).toBe(true);
    expect(r.differences).toEqual([]);
    expect(r.comparedCells).toBe(15 + 2);
    expect(r.sheets.A).toEqual({ rows: 3, columns: 5 });
  });

  it('ignores sheets that are not asked for, in either workbook', () => {
    const r = compareWorkbooks(book({ ...base(), Notes: [['expected only']] }), book({ ...base(), Extra: [['actual only']] }), ['A', 'B']);
    expect(r.ok).toBe(true);
  });

  it('accepts numbers that differ by less than 1e-9', () => {
    const a = base();
    a.A![1]![1] = 1.5 + 1e-12;
    expect(compare(a).ok).toBe(true);
  });

  it('treats an absent cell and a cell with no value as the same empty cell', () => {
    const a = base();
    a.A![2]![4] = undefined;
    expect(compare(a).ok).toBe(true);
  });
});

describe('compareWorkbooks: every kind of difference fails', () => {
  const one = (mutate: (a: Record<string, Rows>) => void) => {
    const a = base();
    mutate(a);
    return compare(a);
  };

  it('a different text value, naming the sheet, the cell and both values', () => {
    const r = one((a) => (a.A![1]![4] = 'hellO'));
    expect(r.ok).toBe(false);
    expect(r.differences).toHaveLength(1);
    expect(r.differences[0]).toMatchObject({ sheet: 'A', cell: 'E2', kind: 'value', expected: 'text "hello"', actual: 'text "hellO"' });
  });

  it('text compares exactly: case and spaces count', () => {
    expect(one((a) => (a.A![1]![0] = 'X')).ok).toBe(false);
    expect(one((a) => (a.A![1]![0] = 'x ')).ok).toBe(false);
  });

  it('a number that differs by more than 1e-9', () => {
    const r = one((a) => (a.A![1]![1] = 1.5 + 1e-6));
    expect(r.differences[0]).toMatchObject({ cell: 'B2', kind: 'value' });
  });

  it('a number against text that looks like it', () => {
    const r = one((a) => (a.A![1]![1] = '1.5'));
    expect(r.differences[0]).toMatchObject({ cell: 'B2', kind: 'type' });
  });

  it('a date against a number, and a different date', () => {
    const asNumber = one((a) => (a.A![1]![2] = 46295));
    expect(asNumber.differences[0]).toMatchObject({ cell: 'C2', kind: 'type' });
    const other = one((a) => (a.A![1]![2] = day(2026, 9, 29)));
    expect(other.differences[0]).toMatchObject({ cell: 'C2', kind: 'value' });
  });

  it('a boolean against its text, and the other boolean', () => {
    expect(one((a) => (a.A![1]![3] = 'TRUE')).differences[0]).toMatchObject({ cell: 'D2', kind: 'type' });
    expect(one((a) => (a.A![1]![3] = false)).differences[0]).toMatchObject({ cell: 'D2', kind: 'value' });
  });

  it('a value where the expected cell is empty, and an empty cell where a value is expected', () => {
    expect(one((a) => (a.A![2]![4] = 'extra')).differences[0]).toMatchObject({ cell: 'E3', kind: 'type' });
    expect(one((a) => (a.A![1]![4] = null)).differences[0]).toMatchObject({ cell: 'E2', kind: 'type' });
  });

  it('an empty text is not an empty cell', () => {
    expect(one((a) => (a.A![2]![4] = '')).ok).toBe(false);
  });

  it('a changed header cell', () => {
    expect(one((a) => (a.A![0]![1] = 'N')).differences[0]).toMatchObject({ cell: 'B1', kind: 'value' });
  });

  it('a missing row and an extra row, reported as a size difference', () => {
    const fewer = one((a) => a.A!.pop());
    expect(fewer.differences.some((d) => d.kind === 'size' && /3 rows.*2 rows/.test(d.message))).toBe(true);
    const more = one((a) => a.A!.push(['z', 1, day(2026, 1, 1), true, 'q']));
    expect(more.differences.some((d) => d.kind === 'size')).toBe(true);
  });

  it('an extra column and a missing column', () => {
    expect(one((a) => a.A!.forEach((row) => row.push('c'))).ok).toBe(false);
    expect(one((a) => a.A!.forEach((row) => row.pop())).ok).toBe(false);
  });

  it('a missing sheet, a renamed sheet and a different sheet order', () => {
    const missing = compare({ A: base().A! });
    expect(missing.differences[0]).toMatchObject({ sheet: 'B', kind: 'missing-sheet' });
    const renamed = compare({ A: base().A!, b: base().B! });
    expect(renamed.differences[0]).toMatchObject({ sheet: 'B', kind: 'missing-sheet' });
    const swapped = compare(base(), ['A', 'B'], base());
    expect(swapped.ok).toBe(true);
    const reordered = compareWorkbooks(book(base()), book(base(), ['B', 'A']), ['A', 'B']);
    expect(reordered.differences[0]).toMatchObject({ kind: 'sheet-order' });
  });

  it('a missing sheet in the expected workbook is a problem of the test, not a pass', () => {
    const r = compareWorkbooks(book({ A: base().A! }), book(base()), ['A', 'B']);
    expect(r.ok).toBe(false);
    expect(r.differences[0]?.message).toMatch(/expected workbook/);
  });

  it('reports every difference, not only the first', () => {
    const r = one((a) => {
      a.A![1]![0] = 'q';
      a.A![2]![1] = 99;
    });
    expect(r.differences.map((d) => d.cell)).toEqual(['A2', 'B3']);
  });
});

describe('formatComparison', () => {
  it('summarises a pass and lists the first differences of a failure', () => {
    expect(formatComparison(compare(base()))).toMatch(/2 sheets, 17 cells/);
    const a = base();
    a.A![1]![4] = 'nope';
    const text = formatComparison(compare(a));
    expect(text).toMatch(/A!E2/);
    expect(text).toMatch(/hello/);
    expect(text).toMatch(/nope/);
  });
});
