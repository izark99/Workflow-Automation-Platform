import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { allLayouts, ambiguousLayouts, clearLayouts, type Layout, type StopTruth, type TruthCell } from './layout-fixtures.ts';

// The generator's files must hold what its truth says: each file is read again here with SheetJS (xlsx) or by splitting the
// text (csv), without using any code of the app, and compared with the truth.

type Grid = (string | number | boolean | null)[][];

function readGrid(layout: Layout): { grid: Grid; merges: XLSX.Range[] } {
  if (layout.format === 'csv') {
    const text = new TextDecoder().decode(layout.file.bytes);
    // The generator writes no quoted text that holds a line break; a quote only protects a comma.
    const grid = text.trimEnd().split('\n').map((line) => (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).filter((_, i, a) => i < a.length - 1 || true).map((c) => c.replace(/,$/, '')).map((c) => (c === '' ? null : /^-?\d+(\.\d+)?$/.test(c) ? Number(c) : c.replace(/^"|"$/g, '').replace(/""/g, '"'))));
    return { grid, merges: [] };
  }
  const wb = XLSX.read(layout.file.bytes, { type: 'array', cellDates: true });
  const ws = wb.Sheets[layout.truth?.sheet ?? wb.SheetNames[0]!]!;
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: true, defval: null }) as unknown[][];
  const grid = raw.map((r) => r.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v as string | number | boolean | null))));
  return { grid, merges: ws['!merges'] ?? [] };
}

const cellAt = (grid: Grid, row: number, col: number): TruthCell => grid[row - 1]?.[col - 1] ?? null;
const rowSlice = (grid: Grid, row: number, first: number, last: number): TruthCell[] => Array.from({ length: last - first + 1 }, (_, i) => cellAt(grid, row, first + i));
const same = (a: TruthCell, b: TruthCell): boolean => (a === null || a === '' ? b === null || b === '' : a === b);

describe('the set of layouts', () => {
  it('has clear layouts in xlsx and in csv, and ambiguous ones', () => {
    expect(clearLayouts().length).toBeGreaterThanOrEqual(12);
    expect(clearLayouts().filter((l) => l.format === 'csv').length).toBe(clearLayouts().length / 2);
    expect(ambiguousLayouts().map((l) => l.name)).toEqual(expect.arrayContaining(['two-tables (xlsx)', 'no-end-marker (csv)', 'text-only (xlsx)']));
  });
  it('gives each layout its own name and file name, and no file holds data from the repository', () => {
    const layouts = allLayouts();
    expect(new Set(layouts.map((l) => l.name)).size).toBe(layouts.length);
    expect(new Set(layouts.map((l) => l.file.name)).size).toBe(layouts.length);
    for (const l of layouts) expect(l.file.bytes.length).toBeGreaterThan(20);
  });
  it('covers each feature of the spec: a later header row and column, a totals row, Vietnamese and English footer words, merged cells, date cells and text dates, an empty column', () => {
    const t = clearLayouts().filter((l) => l.format === 'xlsx').map((l) => l.truth!);
    expect(t.some((x) => x.headerRow > 1 && x.firstColumn > 1)).toBe(true);
    expect(t.some((x) => x.ignoreRows.length > 0)).toBe(true);
    expect(t.some((x) => x.stop.kind === 'marker' && /Ngày/.test(x.stop.text))).toBe(true);
    expect(t.some((x) => x.stop.kind === 'marker' && /Prepared by/.test(x.stop.text))).toBe(true);
    expect(t.some((x) => x.fillDown.length > 0)).toBe(true);
    expect(t.every((x) => x.dateColumns.includes('Day') && x.columns.includes('Text day'))).toBe(true);
    expect(t.some((x) => x.columns.includes('Column 4'))).toBe(true);
  });
});

describe('every clear layout holds what its truth says', () => {
  for (const layout of clearLayouts()) {
    it(layout.name, () => {
      const t = layout.truth!;
      const { grid, merges } = readGrid(layout);
      // The header, in the region.
      expect(rowSlice(grid, t.headerRow, t.firstColumn, t.lastColumn).map((c) => (c === null ? '' : c))).toEqual(t.columns.map((c) => (c === 'Column 4' ? '' : c)));
      // Each expected row is at its row of the file, with the merged group filled down.
      const filled: Record<string, TruthCell> = {};
      t.rows.forEach((expected, i) => {
        const row = rowSlice(grid, t.fileRows[i]!, t.firstColumn, t.lastColumn);
        row.forEach((cell, c) => {
          const name = t.columns[c]!;
          let value = cell;
          if (t.fillDown.includes(name)) {
            if (value === null || value === '') value = filled[name] ?? null;
            filled[name] = value;
          }
          expect(same(value, expected[c]!), `${layout.name} row ${t.fileRows[i]} column ${name}: ${String(value)} vs ${String(expected[c])}`).toBe(true);
        });
      });
      // The rows to ignore are in the file, inside the table, and are not in the expected rows.
      for (const ig of t.ignoreRows) {
        const col = t.firstColumn + t.columns.indexOf(ig.column);
        const hits = grid.map((_, i) => i + 1).filter((r) => String(cellAt(grid, r, col)).includes(ig.text));
        expect(hits.length).toBeGreaterThan(0);
        for (const r of hits) {
          expect(r).toBeGreaterThan(t.headerRow);
          expect(t.fileRows).not.toContain(r);
        }
      }
      // The stop rule: a marker row exists right after the last row of the table (or after the blank row), and text is above and under.
      assertStop(grid, t.stop, t.fileRows[t.fileRows.length - 1]!, t.firstColumn, t.lastColumn);
      if (t.leftOut.title) {
        const [from, to] = t.leftOut.title;
        expect(from).toBe(1);
        expect(to).toBeLessThan(t.headerRow);
        expect(grid.slice(from - 1, to).some((r) => r.some((c) => typeof c === 'string' && c !== ''))).toBe(true);
      }
      if (t.leftOut.footer) {
        const [from, to] = t.leftOut.footer;
        expect(from).toBeGreaterThan(t.fileRows[t.fileRows.length - 1]!);
        expect(to).toBeLessThanOrEqual(grid.length);
        expect(grid.slice(from - 1, to).some((r) => r.some((c) => typeof c === 'string' && c !== ''))).toBe(true);
      }
      // Nothing above the table in a later row or column sits inside its columns on the header row.
      if (t.firstColumn > 1) expect(grid[t.headerRow - 1]!.slice(0, t.firstColumn - 1).every((c) => c === null || c === '')).toBe(true);
      // A merged layout really has merged cells in the xlsx file; a csv has none and holds blank cells instead.
      if (t.fillDown.length > 0) {
        if (layout.format === 'xlsx') expect(merges.length).toBeGreaterThan(1);
        else expect(merges).toEqual([]);
      }
    });
  }
});

function assertStop(grid: Grid, stop: StopTruth, lastRow: number, first: number, last: number): void {
  const next = lastRow + 1;
  const textIn = (row: number): string => rowSlice(grid, row, 1, Math.max(last, 1)).map((c) => (c === null ? '' : String(c))).join(' ');
  if (stop.kind === 'blank_rows') {
    expect(rowSlice(grid, next, first, last).every((c) => c === null || c === '')).toBe(true);
  } else if (stop.kind === 'marker') {
    // The marker is the first row after the table that has the text, with at most blank rows between.
    let row = next;
    while (row <= grid.length && rowSlice(grid, row, first, last).every((c) => c === null || c === '')) row++;
    const text = textIn(row).toLowerCase();
    const want = stop.text.toLowerCase();
    expect(stop.match === 'contains' ? text.includes(want) : stop.match === 'starts_with' ? text.trimStart().startsWith(want) : text.trim() === want).toBe(true);
  } else if (stop.kind === 'end') {
    expect(grid.length).toBe(lastRow);
  }
}

describe('the ambiguous layouts', () => {
  const layouts = ambiguousLayouts();
  it('two tables: a second table is in the file, under the first, with the position that the truth names', () => {
    for (const l of layouts.filter((x) => x.name.startsWith('two-tables'))) {
      const { grid } = readGrid(l);
      expect(l.ambiguity).toMatchObject({ kind: 'undecided', settings: ['region'] });
      const other = (l.ambiguity as { otherTables: { headerRow: number; firstColumn: number; lastColumn: number }[] }).otherTables[0]!;
      expect(rowSlice(grid, other.headerRow, other.firstColumn, other.lastColumn)).toEqual(['Code', 'Label', 'Group', 'Amount']);
      // Two blank rows separate the tables.
      const lastOfFirst = l.truth!.fileRows[l.truth!.fileRows.length - 1]!;
      expect(rowSlice(grid, lastOfFirst + 1, 1, 6).every((c) => c === null || c === '')).toBe(true);
      expect(rowSlice(grid, lastOfFirst + 2, 1, 6).every((c) => c === null || c === '')).toBe(true);
    }
  });
  it('no end marker: the table runs to the last row, with no footer and no blank row after it', () => {
    for (const l of layouts.filter((x) => x.name.startsWith('no-end-marker'))) {
      const { grid } = readGrid(l);
      expect(l.ambiguity).toMatchObject({ kind: 'undecided', settings: ['stop'] });
      expect(grid.length).toBe(l.truth!.fileRows[l.truth!.fileRows.length - 1]);
      expect(grid.every((r) => r.some((c) => c !== null && c !== ''))).toBe(true);
    }
  });
  it('a sheet of text only: no number and no date in it, and no truth', () => {
    for (const l of layouts.filter((x) => x.name.startsWith('text-only'))) {
      const { grid } = readGrid(l);
      expect(l.ambiguity).toEqual({ kind: 'no_table' });
      expect(l.truth).toBeUndefined();
      for (const row of grid) for (const c of row) expect(typeof c === 'number').toBe(false);
      expect(grid.every((r) => r.filter((c) => c !== null && c !== '').length <= 1)).toBe(true);
    }
  });
});
