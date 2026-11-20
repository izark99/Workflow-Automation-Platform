// Files whose table sits inside a larger sheet (SPEC 13.2), made by a script: no file is committed and nothing from
// `testcase/` is used. Each layout returns the file (xlsx bytes written with SheetJS, or csv text), what a correct reading
// of it must be (the "truth": the region settings and the expected rows, with the row numbers of the file), and for an
// ambiguous layout what cannot be decided. The data is made up: neutral codes, labels, groups, amounts and days.
import { xlsxBytes, type FixtureCell, type FixtureSheet } from './refimport-fixtures.ts';

export type TruthCell = string | number | boolean | null;

/** Where the reading stops. `marker` is a row that has the text in the chosen column (or in any column), not read itself. */
export type StopTruth =
  | { kind: 'end' }
  | { kind: 'blank_rows'; count: number }
  | { kind: 'marker'; text: string; match: 'contains' | 'starts_with' | 'equals'; column?: string }
  | { kind: 'row'; row: number };

export interface LayoutTruth {
  /** The sheet to read (xlsx). A csv has none. */
  sheet?: string;
  /** 1-based row of the header, 1-based first and last column of the table. */
  headerRow: number;
  firstColumn: number;
  lastColumn: number;
  stop: StopTruth;
  /** The column names of the header. */
  columns: string[];
  /** The rows that must be read, as the engine returns them: dates as `2026-09-30`, merged cells filled down. */
  rows: TruthCell[][];
  /** The 1-based row of the file that each expected row comes from. */
  fileRows: number[];
  /** Columns that hold dates (real date cells in an xlsx file) or that look like merged cells. */
  dateColumns: string[];
  fillDown: string[];
  /** Rows to ignore inside the table: those that have the text in the column. */
  ignoreRows: { column: string; text: string }[];
  /** The rows above and under the table that are left out, as 1-based ranges of the file. */
  leftOut: { title?: [number, number]; footer?: [number, number] };
}

export type Ambiguity =
  /** Several tables, or an end that nothing marks: the analysis must say so with low confidence. */
  | { kind: 'undecided'; settings: ('region' | 'stop')[]; otherTables: { headerRow: number; firstColumn: number; lastColumn: number }[] }
  /** Text only: there is no table. */
  | { kind: 'no_table' };

export interface Layout {
  name: string;
  format: 'xlsx' | 'csv';
  file: { name: string; bytes: Uint8Array };
  /** What a correct reading is. For an ambiguous layout: the table that is the most likely one. Absent for no table. */
  truth?: LayoutTruth;
  ambiguity?: Ambiguity;
}

const enc = new TextEncoder();

// ---- The table that every layout holds (made-up data) -----------------------------------------------------------------

const COLUMNS = ['Code', 'Label', 'Group', 'Amount', 'Day', 'Text day'];
const GROUPS = ['North', 'South', 'East'];
const day = (i: number): Date => new Date(Date.UTC(2026, 8, 1 + i)); // 1 Sep 2026 and on
const iso = (d: Date): string => d.toISOString().slice(0, 10);

interface Row {
  cells: FixtureCell[]; // as written in the xlsx file (a Date is a date cell)
  truth: TruthCell[]; // as read
}

/** `n` rows: a code, a label, a group, an amount, a date cell and a text date. */
function body(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const d = day(i);
    const code = `K${String(i + 1).padStart(3, '0')}`;
    const label = `Item ${i + 1}`;
    const group = GROUPS[i % GROUPS.length]!;
    const amount = 10 + i * 2.5;
    return { cells: [code, label, group, amount, d, iso(d)], truth: [code, label, group, amount, iso(d), iso(d)] };
  });
}

const TITLE = ['Monthly list of items', 'Made-up data for tests', 'Period: September 2026'];

const pad = (cells: FixtureCell[], before: number): FixtureCell[] => [...Array.from({ length: before }, () => null), ...cells];

function csvText(rows: FixtureCell[][]): string {
  const cell = (v: FixtureCell): string => {
    if (v === null) return '';
    if (v instanceof Date) return iso(v);
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

interface Build {
  name: string;
  /** All rows of the sheet, as written. */
  sheetRows: FixtureCell[][];
  merges?: FixtureSheet['merges'];
  truth: LayoutTruth;
}

function asLayout(b: Build, format: 'xlsx' | 'csv'): Layout {
  const sheet = 'Report';
  const truth: LayoutTruth = { ...b.truth, ...(format === 'xlsx' ? { sheet } : { sheet: undefined }) };
  if (format === 'csv') delete truth.sheet;
  const file =
    format === 'xlsx'
      ? { name: `${b.name}.xlsx`, bytes: new Uint8Array(xlsxBytes([{ name: sheet, rows: b.sheetRows, merges: b.merges }])) }
      : { name: `${b.name}.csv`, bytes: enc.encode(csvText(b.sheetRows)) };
  return { name: `${b.name} (${format})`, format, file, truth };
}

/** The columns of a table in 0-based positions, for a table that starts at column `first` (1-based). */
const lastCol = (first: number): number => first + COLUMNS.length - 1;

// ---- Clear layouts: every one has a table that a person can see, and a truth ---------------------------------------------

function titleAndFooter(): Build {
  const rows = body(6);
  const sheetRows: FixtureCell[][] = [
    [TITLE[0]!],
    [TITLE[1]!],
    [TITLE[2]!],
    [],
    COLUMNS,
    ...rows.map((r) => r.cells),
    [],
    ['Prepared by: A. Maker'],
    ['Signature'],
  ];
  return {
    name: 'title-and-footer',
    sheetRows,
    truth: {
      headerRow: 5,
      firstColumn: 1,
      lastColumn: 6,
      stop: { kind: 'marker', text: 'Prepared by', match: 'starts_with' },
      columns: COLUMNS,
      rows: rows.map((r) => r.truth),
      fileRows: rows.map((_, i) => 6 + i),
      dateColumns: ['Day'],
      fillDown: [],
      ignoreRows: [],
      leftOut: { title: [1, 3], footer: [12, 14] },
    },
  };
}

/** The table starts at row 4 and column C, with a note above it and a blank row under it. */
function laterRowAndColumn(): Build {
  const rows = body(5);
  const sheetRows: FixtureCell[][] = [['Exported from another system'], [], [], pad(COLUMNS, 2), ...rows.map((r) => pad(r.cells, 2)), [], ['Page 1 of 1']];
  return {
    name: 'later-row-and-column',
    sheetRows,
    truth: {
      headerRow: 4,
      firstColumn: 3,
      lastColumn: lastCol(3),
      stop: { kind: 'blank_rows', count: 1 },
      columns: COLUMNS,
      rows: rows.map((r) => r.truth),
      fileRows: rows.map((_, i) => 5 + i),
      dateColumns: ['Day'],
      fillDown: [],
      ignoreRows: [],
      leftOut: { title: [1, 1], footer: [10, 11] },
    },
  };
}

/** A totals row in the middle of the table (to ignore), then a footer. */
function totalsRow(): Build {
  const rows = body(6);
  const total: FixtureCell[] = ['', 'Subtotal', null, 99, null, null];
  const all = [...rows.slice(0, 3).map((r) => r.cells), total, ...rows.slice(3).map((r) => r.cells)];
  const fileRows = [4, 5, 6, 8, 9, 10];
  return {
    name: 'totals-row',
    sheetRows: [[TITLE[0]!], [], COLUMNS, ...all, [], ['Approved by']],
    truth: {
      headerRow: 3,
      firstColumn: 1,
      lastColumn: 6,
      stop: { kind: 'marker', text: 'Approved by', match: 'contains' },
      columns: COLUMNS,
      rows: rows.map((r) => r.truth),
      fileRows,
      dateColumns: ['Day'],
      fillDown: [],
      ignoreRows: [{ column: 'Label', text: 'Subtotal' }],
      leftOut: { title: [1, 1], footer: [11, 12] },
    },
  };
}

/** Footer words in Vietnamese (the first column of the footer row holds the text), with the date and place before them. */
function vietnameseFooter(): Build {
  const rows = body(4);
  return {
    name: 'vietnamese-footer',
    sheetRows: [['Danh sách mẫu'], [], COLUMNS, ...rows.map((r) => r.cells), ['Ngày 30 tháng 9 năm 2026'], ['Người lập'], ['Ký tên']],
    truth: {
      headerRow: 3,
      firstColumn: 1,
      lastColumn: 6,
      stop: { kind: 'marker', text: 'Ngày', match: 'starts_with' },
      columns: COLUMNS,
      rows: rows.map((r) => r.truth),
      fileRows: rows.map((_, i) => 4 + i),
      dateColumns: ['Day'],
      fillDown: [],
      ignoreRows: [],
      leftOut: { title: [1, 1], footer: [8, 10] },
    },
  };
}

/** A merged title across the table and a merged group column (the value is only in the first cell of each merge). */
function mergedCells(): Build {
  const rows = body(6);
  // The group column is merged in pairs: the second row of each pair is blank in the file, and filled down when read.
  const cells = rows.map((r, i) => [...r.cells.slice(0, 2), i % 2 === 0 ? GROUPS[(i / 2) % GROUPS.length]! : null, ...r.cells.slice(3)]);
  const truthRows = rows.map((r, i) => [...r.truth.slice(0, 2), GROUPS[Math.floor(i / 2) % GROUPS.length]!, ...r.truth.slice(3)]);
  return {
    name: 'merged-cells',
    sheetRows: [[TITLE[0]!, null, null, null, null, null], [], COLUMNS, ...cells, [], ['Signature']],
    merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, ...[0, 2, 4].map((i) => ({ s: { r: 3 + i, c: 2 }, e: { r: 4 + i, c: 2 } }))],
    truth: {
      headerRow: 3,
      firstColumn: 1,
      lastColumn: 6,
      stop: { kind: 'marker', text: 'Signature', match: 'equals' },
      columns: COLUMNS,
      rows: truthRows,
      fileRows: rows.map((_, i) => 4 + i),
      dateColumns: ['Day'],
      fillDown: ['Group'],
      ignoreRows: [],
      leftOut: { title: [1, 1], footer: [10, 11] },
    },
  };
}

/** A column in the middle of the table that is empty, header included: the region still reaches over it. */
function emptyColumn(): Build {
  const rows = body(5);
  const without = (r: FixtureCell[]): FixtureCell[] => [...r.slice(0, 3), null, ...r.slice(3)];
  const columns = [...COLUMNS.slice(0, 3), 'Column 4', ...COLUMNS.slice(3)];
  return {
    name: 'empty-column',
    sheetRows: [[TITLE[0]!], [], without([...COLUMNS]), ...rows.map((r) => without(r.cells)), [], ['Prepared by']],
    truth: {
      headerRow: 3,
      firstColumn: 1,
      lastColumn: 7,
      stop: { kind: 'blank_rows', count: 1 },
      columns,
      rows: rows.map((r) => [...r.truth.slice(0, 3), null, ...r.truth.slice(3)]),
      fileRows: rows.map((_, i) => 4 + i),
      dateColumns: ['Day'],
      fillDown: [],
      ignoreRows: [],
      leftOut: { title: [1, 1], footer: [9, 10] },
    },
  };
}

// ---- Ambiguous layouts -------------------------------------------------------------------------------------------------

/** Two tables in one sheet, side by side in the rows: nothing says which one the step should read. */
function twoTables(format: 'xlsx' | 'csv'): Layout {
  const first = body(4);
  const second = body(3).map((r) => r.cells.slice(0, 4));
  const sheetRows: FixtureCell[][] = [
    ['First list'],
    COLUMNS,
    ...first.map((r) => r.cells),
    [],
    [],
    ['Second list'],
    ['Code', 'Label', 'Group', 'Amount'],
    ...second,
  ];
  const base = asLayout(
    {
      name: 'two-tables',
      sheetRows,
      truth: {
        headerRow: 2,
        firstColumn: 1,
        lastColumn: 6,
        stop: { kind: 'blank_rows', count: 1 },
        columns: COLUMNS,
        rows: first.map((r) => r.truth),
        fileRows: first.map((_, i) => 3 + i),
        dateColumns: ['Day'],
        fillDown: [],
        ignoreRows: [],
        leftOut: { title: [1, 1] },
      },
    },
    format,
  );
  return { ...base, ambiguity: { kind: 'undecided', settings: ['region'], otherTables: [{ headerRow: 3 + first.length + 3, firstColumn: 1, lastColumn: 4 }] } };
}

/** A table with nothing under it: no footer and no blank row, so nothing marks where it ends. */
function noEndMarker(format: 'xlsx' | 'csv'): Layout {
  const rows = body(5);
  const base = asLayout(
    {
      name: 'no-end-marker',
      sheetRows: [COLUMNS, ...rows.map((r) => r.cells)],
      truth: {
        headerRow: 1,
        firstColumn: 1,
        lastColumn: 6,
        stop: { kind: 'end' },
        columns: COLUMNS,
        rows: rows.map((r) => r.truth),
        fileRows: rows.map((_, i) => 2 + i),
        dateColumns: ['Day'],
        fillDown: [],
        ignoreRows: [],
        leftOut: {},
      },
    },
    format,
  );
  return { ...base, ambiguity: { kind: 'undecided', settings: ['stop'], otherTables: [] } };
}

/** A sheet that holds only sentences: no table. */
function textOnly(format: 'xlsx' | 'csv'): Layout {
  const lines: FixtureCell[][] = [['Notes for the next meeting'], ['Please bring the printed copies.'], ['The room changes on Friday.'], ['Thank you.']];
  const base = asLayout({ name: 'text-only', sheetRows: lines, truth: undefined as never }, format);
  const { truth: _unused, ...rest } = base;
  void _unused;
  return { ...rest, ambiguity: { kind: 'no_table' } };
}

// ---- The sets ----------------------------------------------------------------------------------------------------------

const CLEAR: (() => Build)[] = [titleAndFooter, laterRowAndColumn, totalsRow, vietnameseFooter, mergedCells, emptyColumn];

/** The clear layouts as xlsx, and as csv where the layout has a csv form (every one: a csv has the same cells). */
export function clearLayouts(): Layout[] {
  return CLEAR.flatMap((make) => [asLayout(make(), 'xlsx'), asLayout(make(), 'csv')]);
}

export function ambiguousLayouts(): Layout[] {
  return [twoTables('xlsx'), twoTables('csv'), noEndMarker('xlsx'), noEndMarker('csv'), textOnly('xlsx'), textOnly('csv')];
}

export const allLayouts = (): Layout[] => [...clearLayouts(), ...ambiguousLayouts()];
