// Cell-by-cell comparison of two workbooks, for the acceptance test. It is strict on purpose: the tests are the judge.
import * as XLSX from 'xlsx';

export type DifferenceKind = 'missing-sheet' | 'sheet-order' | 'size' | 'type' | 'value';

export interface Difference {
  sheet: string;
  /** A1 address. Missing for a difference of the whole sheet. */
  cell?: string;
  kind: DifferenceKind;
  expected?: string;
  actual?: string;
  message: string;
}

export interface Comparison {
  ok: boolean;
  differences: Difference[];
  comparedCells: number;
  sheets: Record<string, { rows: number; columns: number }>;
}

type Normal =
  | { type: 'empty' }
  | { type: 'number'; value: number }
  | { type: 'date'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'error'; value: string };

/** Reads a workbook the way the comparison needs it: date-formatted cells become dates. */
export function readWorkbook(bytes: Uint8Array): XLSX.WorkBook {
  return XLSX.read(bytes, { type: 'array', cellDates: true });
}

function normalize(cell: XLSX.CellObject | undefined): Normal {
  if (!cell || cell.t === 'z') return { type: 'empty' };
  switch (cell.t) {
    case 'n':
      return { type: 'number', value: cell.v as number };
    case 'd':
      return { type: 'date', value: (cell.v as Date).getTime() };
    case 'b':
      return { type: 'boolean', value: cell.v as boolean };
    case 'e':
      return { type: 'error', value: String(cell.w ?? cell.v) };
    default:
      return { type: 'string', value: String(cell.v) };
  }
}

function show(n: Normal): string {
  switch (n.type) {
    case 'empty':
      return '(empty)';
    case 'date':
      return `date ${new Date(n.value).toISOString().slice(0, 10)}`;
    case 'string':
      return `text ${JSON.stringify(n.value)}`;
    default:
      return `${n.type} ${String(n.value)}`;
  }
}

const NUMBER_TOLERANCE = 1e-9;

function extent(ws: XLSX.WorkSheet | undefined): { rows: number; columns: number; endRow: number; endCol: number } {
  if (!ws?.['!ref']) return { rows: 0, columns: 0, endRow: -1, endCol: -1 };
  const r = XLSX.utils.decode_range(ws['!ref']);
  return { rows: r.e.r - r.s.r + 1, columns: r.e.c - r.s.c + 1, endRow: r.e.r, endCol: r.e.c };
}

/**
 * Compares the named sheets of two workbooks cell by cell: same sheets in the same order, same size, same type and
 * value in every cell. Numbers are equal within 1e-9, dates are compared as dates, text exactly, and an empty cell
 * equals an empty cell (an empty text does not). Sheets that are not named are ignored.
 */
export function compareWorkbooks(expected: XLSX.WorkBook, actual: XLSX.WorkBook, sheetNames: string[]): Comparison {
  const differences: Difference[] = [];
  const sheets: Comparison['sheets'] = {};
  let comparedCells = 0;

  const present = sheetNames.filter((name) => {
    const inExpected = expected.SheetNames.includes(name);
    const inActual = actual.SheetNames.includes(name);
    if (!inExpected) {
      differences.push({ sheet: name, kind: 'missing-sheet', message: `The sheet "${name}" is missing from the expected workbook, so the test itself is wrong. Check the sheet names.` });
    } else if (!inActual) {
      differences.push({ sheet: name, kind: 'missing-sheet', message: `The sheet "${name}" is missing from the actual workbook. It has: ${actual.SheetNames.join(', ') || '(no sheets)'}.` });
    }
    return inExpected && inActual;
  });

  const order = (wb: XLSX.WorkBook) => wb.SheetNames.filter((n) => present.includes(n));
  if (order(expected).join('|') !== order(actual).join('|')) {
    differences.push({
      sheet: present.join(', '),
      kind: 'sheet-order',
      message: `The sheets are in another order. Expected ${order(expected).join(', ')}; got ${order(actual).join(', ')}.`,
    });
  }

  for (const name of present) {
    const ws = { expected: expected.Sheets[name], actual: actual.Sheets[name] };
    const e = extent(ws.expected);
    const a = extent(ws.actual);
    sheets[name] = { rows: a.rows, columns: a.columns };
    if (e.rows !== a.rows || e.columns !== a.columns) {
      differences.push({
        sheet: name,
        kind: 'size',
        expected: `${e.rows} rows x ${e.columns} columns`,
        actual: `${a.rows} rows x ${a.columns} columns`,
        message: `The sheet "${name}" has the wrong size: expected ${e.rows} rows x ${e.columns} columns, got ${a.rows} rows x ${a.columns} columns.`,
      });
    }
    for (let r = 0; r <= Math.max(e.endRow, a.endRow); r++) {
      for (let c = 0; c <= Math.max(e.endCol, a.endCol); c++) {
        comparedCells++;
        const address = XLSX.utils.encode_cell({ r, c });
        const x = normalize(ws.expected?.[address] as XLSX.CellObject | undefined);
        const y = normalize(ws.actual?.[address] as XLSX.CellObject | undefined);
        let kind: DifferenceKind | undefined;
        if (x.type !== y.type) kind = 'type';
        else if (x.type === 'number' && y.type === 'number') kind = Math.abs(x.value - y.value) > NUMBER_TOLERANCE ? 'value' : undefined;
        else if (x.type !== 'empty' && y.type !== 'empty' && x.value !== y.value) kind = 'value';
        if (kind) {
          differences.push({
            sheet: name,
            cell: address,
            kind,
            expected: show(x),
            actual: show(y),
            message: `${name}!${address}: expected ${show(x)}, got ${show(y)}.`,
          });
        }
      }
    }
  }
  return { ok: differences.length === 0, differences, comparedCells, sheets };
}

/** A short report: a summary line for a pass, the first differences for a failure. */
export function formatComparison(c: Comparison, limit = 20): string {
  if (c.ok) return `Workbooks are equal: ${Object.keys(c.sheets).length} sheets, ${c.comparedCells} cells compared.`;
  const shown = c.differences.slice(0, limit).map((d) => `  ${d.message}`);
  const more = c.differences.length > limit ? [`  ... and ${c.differences.length - limit} more`] : [];
  return [`${c.differences.length} differences (${c.comparedCells} cells compared):`, ...shown, ...more].join('\n');
}
