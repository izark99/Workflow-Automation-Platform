// The writer of a sheet with a print layout (SPEC 16.1), with ExcelJS. No React. The normal writer (`export.ts`, SheetJS) is not used
// for a workbook that has a layout; it is used, as before, for one that has none.
import type { Workbook, Worksheet } from 'exceljs';
import type { Cell, Column, TableData } from '../../types';
import { loadExcelJS } from './load-exceljs';
import { FONT_POINTS, LINE_POINTS, ROW_POINTS, fitScale, printableArea, signatureFits, wrappedLines } from './pagination';
import type { PageLayout } from './pagination';
import type { Margins, Paper, PrintSettings } from './settings';
import { resolvedTexts } from './tokens';
import type { TokenContext } from './tokens';

/** The language of the fixed words of the file (the footer). The texts of the layout are written as the person typed them. */
export type PrintLanguage = 'vi' | 'en';

export interface PrintSheetInput {
  /** The sheet name. */
  name: string;
  table: TableData;
  /** Text columns whose plain numbers are written as numbers, as in the normal file (D27). */
  numberLikeText: readonly string[];
  print: PrintSettings;
  /** What the tokens of the header lines and the signature block stand for. */
  tokens: TokenContext;
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

/** The footer of the pages: "Trang n/N" in Vietnamese, "Page n/N" in English. */
export const FOOTER: Readonly<Record<PrintLanguage, string>> = { vi: '&CTrang &P/&N', en: '&CPage &P/&N' };

/** Rows of blank space to sign in the signature block. */
export const SIGN_SPACE_ROWS = 4;

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** Writes the header lines in rows 1.., each merged across the table. Returns the height of the rows in points. */
function writeHeaderLines(ws: Worksheet, print: PrintSettings, place: TablePlace): number {
  let height = 0;
  const chars = sum(place.widths);
  print.header.forEach((line, i) => {
    const row = ws.getRow(i + 1);
    const cell = row.getCell(1);
    cell.value = line.text === '' ? null : line.text;
    cell.font = { bold: line.bold, size: FONT_POINTS[line.size] };
    cell.alignment = { horizontal: line.align, vertical: 'middle', wrapText: true };
    if (place.lastColumn > 1) ws.mergeCells(i + 1, 1, i + 1, place.lastColumn);
    const lines = wrappedLines(line.text, Math.max(1, Math.floor((chars * FONT_POINTS.normal) / FONT_POINTS[line.size])));
    row.height = lines * LINE_POINTS[line.size];
    height += row.height;
    row.commit();
  });
  return height;
}

/** The columns of each signer: the block is cut in equal groups, the first groups take the columns that are left over. */
export function signerGroups(columns: number, signers: number): { from: number; to: number }[] {
  const base = Math.floor(columns / signers);
  const extra = columns % signers;
  const out: { from: number; to: number }[] = [];
  let from = 1;
  for (let i = 0; i < signers; i++) {
    const to = from + base + (i < extra ? 1 : 0) - 1;
    out.push({ from, to });
    from = to + 1;
  }
  return out;
}

/** The rows of the signature block: the date line, the titles, the lines under them, the space to sign, the names. */
export function signatureRows(print: PrintSettings): number {
  if (print.signers.length === 0) return 0;
  const hasName = print.signers.some((s) => s.name.trim() !== '');
  return (print.dateLine.trim() === '' ? 0 : 1) + 2 + SIGN_SPACE_ROWS + (hasName ? 1 : 0);
}

/** Writes the signature block from `startRow`. Returns the last row it wrote. */
function writeSignatures(ws: Worksheet, print: PrintSettings, startRow: number, columns: number): number {
  let r = startRow;
  const merge = (row: number, from: number, to: number): void => {
    if (to > from) ws.mergeCells(row, from, row, to);
  };
  if (print.dateLine.trim() !== '') {
    const row = ws.getRow(r);
    row.getCell(1).value = print.dateLine;
    row.getCell(1).font = { italic: true };
    row.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
    merge(r, 1, columns);
    row.commit();
    r += 1;
  }
  const groups = signerGroups(columns, print.signers.length);
  const titleRow = ws.getRow(r);
  const lineRow = ws.getRow(r + 1);
  print.signers.forEach((signer, i) => {
    const g = groups[i]!;
    const title = titleRow.getCell(g.from);
    title.value = signer.title === '' ? null : signer.title;
    title.font = { bold: true };
    title.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const line = lineRow.getCell(g.from);
    line.value = signer.line === '' ? null : signer.line;
    line.font = { italic: true };
    line.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    merge(r, g.from, g.to);
    merge(r + 1, g.from, g.to);
  });
  titleRow.commit();
  lineRow.commit();
  r += 2 + SIGN_SPACE_ROWS;
  if (print.signers.some((s) => s.name.trim() !== '')) {
    const nameRow = ws.getRow(r);
    print.signers.forEach((signer, i) => {
      const g = groups[i]!;
      const cell = nameRow.getCell(g.from);
      cell.value = signer.name === '' ? null : signer.name;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      merge(r, g.from, g.to);
    });
    nameRow.commit();
    r += 1;
  }
  return r - 1;
}

/** The estimate of the page layout of the table: the heights of the rows from the width of their columns. */
function pageLayout(input: PrintSheetInput, print: PrintSettings, place: TablePlace, aboveTable: number): PageLayout {
  const page = { paper: print.paper, orientation: print.orientation, margins: print.margins, fitWidth: print.fitWidth };
  const scale = fitScale(page, place.widths);
  const rowHeight = (cells: readonly (string | null)[]): number => ROW_POINTS * Math.max(1, ...cells.map((t, i) => (t === null ? 1 : wrappedLines(t, place.widths[i] ?? MIN_COLUMN_WIDTH))));
  const { table } = input;
  return {
    aboveTable,
    tableHeader: rowHeight(table.columns.map((c) => c.name)),
    rows: table.rows.map((row) => rowHeight(row.map((v, i) => (typeof v === 'string' && table.columns[i]?.type !== 'date' ? v : null)))),
    repeatHeader: print.repeatHeader,
    capacity: printableArea(page).height / scale,
  };
}

/** Adds one sheet with its layout to the workbook. */
function addSheet(wb: Workbook, input: PrintSheetInput, language: PrintLanguage): void {
  const ws = wb.addWorksheet(input.name);
  const print = resolvedTexts(input.print, input.tokens);
  const lines = print.header.length;
  const startRow = lines === 0 ? 1 : lines + 2;
  const place = writeTable(ws, input, startRow);
  const above = lines === 0 ? 0 : writeHeaderLines(ws, print, place) + ROW_POINTS;

  let lastRow = place.lastRow;
  let columns = place.lastColumn;
  if (print.signers.length > 0) {
    columns = Math.max(place.lastColumn, print.signers.length);
    const block = signatureRows(print) * ROW_POINTS;
    const fits = signatureFits(pageLayout(input, print, place, above), block);
    // When the block does not fit on the last page, a page break goes after the last row of the table and the block opens the next page.
    if (!fits) ws.getRow(place.lastRow).addPageBreak();
    const blockStart = place.lastRow + (fits ? 2 : 1);
    lastRow = writeSignatures(ws, print, blockStart, columns);
  }
  setPage(ws, print, { ...place, lastColumn: columns }, lastRow);
  if (print.pageNumbers) ws.headerFooter = { oddFooter: FOOTER[language] };
}

/** Writes a workbook of sheets that have a print layout. Loads ExcelJS on the first call. */
export async function buildPrintWorkbook(sheets: readonly PrintSheetInput[], language: PrintLanguage = 'vi'): Promise<Uint8Array> {
  const excel = await loadExcelJS();
  const wb = new excel.Workbook();
  wb.creator = 'Data Flow';
  for (const sheet of sheets) addSheet(wb, sheet, language);
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
