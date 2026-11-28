import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { compareWorkbooks, formatComparison } from '../../../../scripts/lib/compare-workbooks';
import type { FlowDefinition } from '../../flow/types';
import type { RunResult } from '../../run';
import type { TableData } from '../../types';
import { readEntryText, readZipDirectory } from '../../xlsx-stream/zip';
import { buildOutputFiles } from '../export';
import { loadExcelJS } from './load-exceljs';
import { defaultPrintSettings } from './settings';
import { columnLetter, MARGIN_INCHES, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, PAPER_CODES, buildPrintWorkbook } from './writer';
import type { PrintSheetInput } from './writer';

const table: TableData = {
  columns: [
    { name: 'Id', type: 'text' },
    { name: 'Name', type: 'text' },
    { name: 'Hours', type: 'number' },
    { name: 'Day', type: 'date' },
    { name: 'Done', type: 'boolean' },
    { name: 'Code', type: 'text' },
    { name: 'Note', type: 'text' },
  ],
  rows: [
    ['E1', 'Nguyễn Văn An', 8.5, '2026-09-01', true, '007', 'A very long note that has to wrap inside its cell when the sheet is printed on paper, again and again and again'],
    ['E2', 'Đặng Thị Hồng', 0, '2026-09-30', false, '123', null],
    ['E3', null, null, null, null, null, ''],
    ['E4', 'Lê', -3, '2026-12-31', true, 'x1', 'ok'],
  ],
};

/** The same table written by the normal path (SheetJS), through the function of the app. */
async function plainWorkbook(t: TableData, sheet: string, numberLike: string[] = []): Promise<XLSX.WorkBook> {
  const flow = { nodes: [{ id: 'o', type: 'output', settings: { file: 'R', format: 'xlsx', sheet, numberLikeText: numberLike } }] } as unknown as Pick<FlowDefinition, 'nodes'>;
  const result = { rows: async () => t } as unknown as RunResult;
  const [file] = await buildOutputFiles(result, flow);
  return XLSX.read(file!.bytes, { type: 'array', cellDates: true });
}

const input = (over: Partial<PrintSheetInput> = {}): PrintSheetInput => ({ name: 'Report', table, numberLikeText: [], print: defaultPrintSettings(), ...over });
const read = (bytes: Uint8Array) => XLSX.read(bytes, { type: 'array', cellDates: true });

async function parts(bytes: Uint8Array): Promise<Map<string, string>> {
  const blob = new Blob([bytes as BlobPart]);
  const dir = await readZipDirectory(blob);
  const out = new Map<string, string>();
  for (const [name, entry] of dir) if (/\.(xml|rels)$/.test(name)) out.set(name, await readEntryText(blob, entry));
  return out;
}

describe('the writer of a print layout: the table', () => {
  it('has the same cells as the normal file, cell by cell: text, numbers, dates, booleans, blanks and number-like text', async () => {
    const bytes = await buildPrintWorkbook([input({ numberLikeText: ['Code'] })]);
    const comparison = compareWorkbooks(await plainWorkbook(table, 'Report', ['Code']), read(bytes), ['Report']);
    expect(comparison.ok, formatComparison(comparison)).toBe(true);
    expect(comparison.comparedCells).toBeGreaterThan(20);
  });

  it('writes a date as a date at midnight, in whatever time zone the machine is in', async () => {
    const bytes = await buildPrintWorkbook([input()]);
    const ws = read(bytes).Sheets.Report!;
    const day = ws.D2 as XLSX.CellObject;
    expect(day.t).toBe('d');
    expect((day.v as Date).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('has a table of one header row and the rows, and an empty table is the header row alone', async () => {
    const bytes = await buildPrintWorkbook([input({ table: { columns: table.columns, rows: [] } })]);
    const ws = read(bytes).Sheets.Report!;
    expect(XLSX.utils.decode_range(ws['!ref']!).e.r).toBe(0);
    expect((ws.A1 as XLSX.CellObject).v).toBe('Id');
  });

  it('styles the table: thin borders on every cell, a bold header on a fill, numbers and dates right aligned, text wrapped', async () => {
    const excel = await loadExcelJS();
    const wb = new excel.Workbook();
    await wb.xlsx.load((await buildPrintWorkbook([input()])).buffer as ArrayBuffer);
    const ws = wb.getWorksheet('Report')!;
    const head = ws.getCell('A1');
    expect(head.font?.bold).toBe(true);
    expect(head.fill).toMatchObject({ type: 'pattern', fgColor: { argb: 'FFE8EEF7' } });
    for (const address of ['A1', 'C1', 'A2', 'C2', 'D2', 'G2', 'C4', 'G4']) {
      const b = ws.getCell(address).border;
      expect([b?.top?.style, b?.left?.style, b?.bottom?.style, b?.right?.style], address).toEqual(['thin', 'thin', 'thin', 'thin']);
    }
    expect(ws.getCell('C2').alignment?.horizontal).toBe('right');
    expect(ws.getCell('D2').alignment?.horizontal).toBe('right');
    expect(ws.getCell('C1').alignment?.horizontal).toBe('right');
    expect(ws.getCell('G2').alignment?.wrapText).toBe(true);
    expect(ws.getCell('D2').numFmt).toBe('dd/mm/yyyy');
  });

  it('takes the column widths from the content: at least 8 and at most 50 characters', async () => {
    const excel = await loadExcelJS();
    const wb = new excel.Workbook();
    await wb.xlsx.load((await buildPrintWorkbook([input()])).buffer as ArrayBuffer);
    const ws = wb.getWorksheet('Report')!;
    expect(ws.getColumn(1).width).toBe(MIN_COLUMN_WIDTH);
    expect(ws.getColumn(2).width).toBeGreaterThan(MIN_COLUMN_WIDTH);
    expect(ws.getColumn(7).width).toBe(MAX_COLUMN_WIDTH);
  });
});

describe('the writer of a print layout: the page', () => {
  it('sets A4, portrait, normal margins, fit to one page wide with a free height, no gridlines, the print area and the repeated header row', async () => {
    const bytes = await buildPrintWorkbook([input()]);
    const p = await parts(bytes);
    const sheet = p.get('xl/worksheets/sheet1.xml')!;
    const book = p.get('xl/workbook.xml')!;
    expect(sheet).toMatch(/<pageSetup[^>]*paperSize="9"/);
    expect(sheet).toMatch(/<pageSetup[^>]*orientation="portrait"/);
    expect(sheet).toMatch(/<pageSetup[^>]*fitToWidth="1"/);
    expect(sheet).toMatch(/<pageSetup[^>]*fitToHeight="0"/);
    expect(sheet).toMatch(/<pageSetUpPr[^>]*fitToPage="1"/);
    expect(sheet).toMatch(/<pageMargins[^>]*left="0.7"[^>]*right="0.7"[^>]*top="0.75"[^>]*bottom="0.75"/);
    expect(sheet).toMatch(/showGridLines="0"/);
    expect(sheet).not.toMatch(/<printOptions[^>]*gridLines="1"/);
    // A1 to G5: the 7 columns and the header row and 4 rows (ExcelJS writes the absolute form of the range).
    expect(book).toMatch(/_xlnm\.Print_Area[^>]*>[^<]*Report[^<]*!\$A\$?1:\$G\$?5</);
    expect(book).toMatch(/_xlnm\.Print_Titles[^>]*>[^<]*Report[^<]*\$1:\$1/);
  });

  it('sets A3, landscape and narrow margins, no fit to width, and no repeated header row', async () => {
    const bytes = await buildPrintWorkbook([input({ print: { ...defaultPrintSettings(), paper: 'A3', orientation: 'landscape', margins: 'narrow', fitWidth: false, repeatHeader: false } })]);
    const p = await parts(bytes);
    const sheet = p.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toMatch(/<pageSetup[^>]*paperSize="8"/);
    expect(sheet).toMatch(/<pageSetup[^>]*orientation="landscape"/);
    expect(sheet).not.toMatch(/fitToPage="1"/);
    expect(sheet).toMatch(/<pageMargins[^>]*left="0.25"[^>]*right="0.25"/);
    expect(p.get('xl/workbook.xml')!).not.toMatch(/Print_Titles/);
  });

  it('knows the codes of the papers, the margins of Excel and the letters of the columns', () => {
    expect(PAPER_CODES).toEqual({ A4: 9, A3: 8, Letter: 1 });
    expect(MARGIN_INCHES.wide).toEqual({ side: 1, topBottom: 1, headerFooter: 0.5 });
    expect([columnLetter(1), columnLetter(26), columnLetter(27), columnLetter(52), columnLetter(703)]).toEqual(['A', 'Z', 'AA', 'AZ', 'AAA']);
  });

  it('writes a workbook of two sheets, each with its own layout, in the order given', async () => {
    const bytes = await buildPrintWorkbook([input({ name: 'First' }), input({ name: 'Second', print: { ...defaultPrintSettings(), paper: 'Letter', orientation: 'landscape' } })]);
    const p = await parts(bytes);
    expect(read(bytes).SheetNames).toEqual(['First', 'Second']);
    expect(p.get('xl/worksheets/sheet1.xml')!).toMatch(/paperSize="9"/);
    expect(p.get('xl/worksheets/sheet2.xml')!).toMatch(/paperSize="1"/);
    expect(p.get('xl/worksheets/sheet2.xml')!).toMatch(/orientation="landscape"/);
  });
});
