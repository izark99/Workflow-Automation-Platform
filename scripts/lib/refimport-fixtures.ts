// Small csv and xlsx files for the tests of the reference table import (never from testcase/). The xlsx files are written
// with SheetJS, so the unit tests and the e2e tests read the kind of file that Excel saves: numbers, dates, booleans,
// blank cells and several sheets.
import * as XLSX from 'xlsx';

export type FixtureCell = string | number | boolean | Date | null;
export interface FixtureSheet {
  name: string;
  rows: FixtureCell[][];
  /** Merged cells (0-based rows and columns, both ends included). The value stays in the first cell, as Excel writes it. */
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[];
}

/** An .xlsx file as bytes. A Date is written as an Excel date cell, a blank (null) is left out. */
export function xlsxBytes(sheets: FixtureSheet[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws: XLSX.WorkSheet = {};
    let maxC = 0;
    s.rows.forEach((row, r) => {
      row.forEach((v, c) => {
        if (v === null) return;
        const ref = XLSX.utils.encode_cell({ r, c });
        if (v instanceof Date) ws[ref] = { t: 'd', v, z: 'yyyy-mm-dd' };
        else if (typeof v === 'number') ws[ref] = { t: 'n', v };
        else if (typeof v === 'boolean') ws[ref] = { t: 'b', v };
        else ws[ref] = { t: 's', v };
        maxC = Math.max(maxC, c);
      });
    });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, s.rows.length - 1), c: maxC } });
    if (s.merges) ws['!merges'] = s.merges;
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }) as Uint8Array;
}

/** A File-like Blob with a name, as the browser gives it. */
export function namedBlob(bytes: BlobPart, name: string, type = 'application/octet-stream'): Blob & { name: string } {
  return Object.assign(new Blob([bytes], { type }), { name });
}

export const xlsxFile = (name: string, sheets: FixtureSheet[]): Blob & { name: string } => namedBlob(xlsxBytes(sheets) as BlobPart, name);
export const csvFile = (name: string, text: string): Blob & { name: string } => namedBlob(text, name, 'text/csv');

/** The limits table of the examples: a code, a limit, a start date, an active flag. */
export const LIMITS_ROWS: FixtureCell[][] = [
  ['Code', 'Limit', 'Valid from', 'Active'],
  ['A1', 12.5, new Date(Date.UTC(2026, 8, 30)), true],
  ['B2', 40, new Date(Date.UTC(2026, 9, 1)), false],
  ['C3', null, null, null],
];
