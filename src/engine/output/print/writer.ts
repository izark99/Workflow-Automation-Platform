// The writer of a sheet with a print layout (SPEC 16.1), with ExcelJS. No React. The normal writer (`export.ts`, SheetJS) is not used
// for a workbook that has a layout; it is used, as before, for one that has none.
import type { Workbook, Worksheet } from 'exceljs';
import type { Cell, Column, TableData } from '../../types';
import { loadExcelJS } from './load-exceljs';
import type { ExcelJSModule } from './load-exceljs';
import type { Margins, Paper, PrintSettings } from './settings';

export interface PrintSheetInput {
  /** The sheet name. */
  name: string;
  table: TableData;
  /** Text columns whose plain numbers are written as numbers, as in the normal file (D27). */
  numberLikeText: readonly string[];
  print: PrintSettings;
}

/** The widths of a column, in characters (SPEC 16.1 item 3). */
export const MIN_COLUMN_WIDTH = 8;
export const MAX_COLUMN_WIDTH = 50;
/** The date format of a printed report: one form, whatever the language (`dd/mm/yyyy`). */
export const PRINT_DATE_FORMAT = 'dd/mm/yyyy';
const NUMBER_FORMAT = 'General';
const HEADER_FILL = 'FFE8EEF7';
const BORDER_COLOR = 'FF8A94A6';

/** The paper size codes of SpreadsheetML. */
export const PAPER_CODES: Readonly<Record<Paper, number>> = { Letter: 1, A3: 8, A4: 9 };

/** Margins in inches: left and right, top and bottom, header and footer (the three choices of Excel). */
export const MARGIN_INCHES: Readonly<Record<Margins, { side: number; topBottom: number; headerFooter: number }>> = {
  normal: { side: 0.7, topBottom: 0.75, headerFooter: 0.3 },
  narrow: { side: 0.25, topBottom: 0.75, headerFooter: 0.3 },
  wide: { side: 1, topBottom: 1, headerFooter: 0.5 },
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PLAIN_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** The date of an ISO text at midnight UTC, so that the time zone of the browser cannot move it by a day. */
function dateOf(iso: string): Date | undefined {
  const m = ISO_DATE.exec(iso);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : undefined;
}

/** The value of a cell in the file, as the normal writer gives it: blank is absent, numbers, dates, booleans and text keep their type. */
function valueOf(v: Cell, column: Column, numberLike: ReadonlySet<string>): string | number | boolean | Date | null {
  if (v === null || v === '') return null;
  if (column.type === 'number') return Number(v);
  if (column.type === 'boolean') return Boolean(v);
  if (column.type === 'date') return dateOf(String(v)) ?? String(v);
  if (numberLike.has(column.name) && PLAIN_NUMBER.test(String(v))) return Number(v);
  return String(v);
}

const textLength = (v: string | number | boolean | Date | null): number => (v === null ? 0 : v instanceof Date ? PRINT_DATE_FORMAT.length : String(v).length);

/** Where the table is on the sheet (rows and columns are 1-based), for what is drawn above and below it. */
export interface TablePlace {
  headerRow: number;
  lastRow: number;
  lastColumn: number;
  /** The width of each column in characters. */
  widths: number[];
}

/** Writes the header row and the rows of the table from `startRow`, with the style of SPEC 16.1 item 3. */
export function writeTable(ws: Worksheet, input: PrintSheetInput, startRow: number): TablePlace {
  const { table } = input;
  const numberLike = new Set(input.numberLikeText);
  const thin = { style: 'thin' as const, color: { argb: BORDER_COLOR } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const widths = table.columns.map((c) => c.name.length);
  const isNumber = (c: Column): boolean => c.type === 'number';

  const header = ws.getRow(startRow);
  table.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.name;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = border;
    cell.alignment = { horizontal: isNumber(c) ? 'right' : 'left', vertical: 'middle', wrapText: true };
  });
  header.commit();

  table.rows.forEach((row, r) => {
    const out = ws.getRow(startRow + 1 + r);
    table.columns.forEach((c, i) => {
      const cell = out.getCell(i + 1);
      const value = valueOf(row[i] ?? null, c, numberLike);
      if (value !== null) cell.value = value;
      cell.border = border;
      if (value instanceof Date) cell.numFmt = PRINT_DATE_FORMAT;
      else if (typeof value === 'number') cell.numFmt = NUMBER_FORMAT;
      cell.alignment = { horizontal: typeof value === 'number' ? 'right' : value instanceof Date ? 'right' : 'left', vertical: 'top', wrapText: typeof value === 'string' };
      if (r < 200) widths[i] = Math.max(widths[i]!, textLength(value));
    });
    out.commit();
  });
  const finalWidths = widths.map((w) => Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, w + 2)));
  finalWidths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return { headerRow: startRow, lastRow: startRow + table.rows.length, lastColumn: Math.max(1, table.columns.length), widths: finalWidths };
}

/** The letter of a column number: 1 is A, 27 is AA. */
export function columnLetter(n: number): string {
  let s = '';
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

/** The page: paper, orientation, margins, fit to one page wide, the repeated header row, no gridlines, the print area. */
export function setPage(ws: Worksheet, print: PrintSettings, place: TablePlace, lastRow: number): void {
  const m = MARGIN_INCHES[print.margins];
  ws.pageSetup = {
    paperSize: PAPER_CODES[print.paper],
    orientation: print.orientation,
    margins: { left: m.side, right: m.side, top: m.topBottom, bottom: m.topBottom, header: m.headerFooter, footer: m.headerFooter },
    fitToPage: print.fitWidth,
    ...(print.fitWidth ? { fitToWidth: 1, fitToHeight: 0 } : { scale: 100 }),
    showGridLines: false,
    horizontalCentered: false,
    printArea: `A1:${columnLetter(place.lastColumn)}${lastRow}`,
    ...(print.repeatHeader ? { printTitlesRow: `${place.headerRow}:${place.headerRow}` } : {}),
  };
  ws.views = [{ showGridLines: false }];
}

/** Adds one sheet with its layout to the workbook. */
function addSheet(excel: ExcelJSModule, wb: Workbook, input: PrintSheetInput): void {
  void excel;
  const ws = wb.addWorksheet(input.name);
  const place = writeTable(ws, input, 1);
  setPage(ws, input.print, place, place.lastRow);
}

/** Writes a workbook of sheets that have a print layout. Loads ExcelJS on the first call. */
export async function buildPrintWorkbook(sheets: readonly PrintSheetInput[]): Promise<Uint8Array> {
  const excel = await loadExcelJS();
  const wb = new excel.Workbook();
  wb.creator = 'Data Flow';
  for (const sheet of sheets) addSheet(excel, wb, sheet);
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
