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
import type { TokenContext } from './tokens';
import { columnLetter, FOOTER, MARGIN_INCHES, signatureRows, signerGroups, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, PAPER_CODES, buildPrintWorkbook } from './writer';
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

const tokens: TokenContext = { effectiveDate: '2026-09-30', runDate: '2026-10-05', flow: 'Monthly timesheet', rows: 4, params: { period: 'Q3' } };
const input = (over: Partial<PrintSheetInput> = {}): PrintSheetInput => ({ name: 'Report', table, numberLikeText: [], print: defaultPrintSettings(), tokens, ...over });
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

const headerLines = [
  { text: 'BÁO CÁO CHẤM CÔNG THÁNG {month_year}', align: 'center' as const, bold: true, size: 'large' as const },
  { text: 'Flow: {flow} - {rows} rows - {param:period}', align: 'left' as const, bold: false, size: 'normal' as const },
];
const signers = [
  { title: 'Người lập biểu', line: '(Ký, ghi rõ họ tên)', name: 'An' },
  { title: 'Kế toán', line: '(Ký, ghi rõ họ tên)', name: '' },
  { title: 'Giám đốc', line: '(Ký, ghi rõ họ tên)', name: 'Bình' },
];
const withBlock = () => ({ ...defaultPrintSettings(), header: headerLines, dateLine: 'Ngày {day} tháng {month} năm {year}', signers });
const sheetXml = async (bytes: Uint8Array): Promise<string> => (await parts(bytes)).get('xl/worksheets/sheet1.xml') ?? '';

describe('the writer of a print layout: the header lines', () => {
  it('writes each line merged across the table, with its tokens replaced, and the table starts two rows below the last line', async () => {
    const bytes = await buildPrintWorkbook([input({ print: withBlock() })]);
    const ws = read(bytes).Sheets.Report!;
    expect(ws.A1!.v).toBe('BÁO CÁO CHẤM CÔNG THÁNG 09/2026');
    expect(ws.A2!.v).toBe('Flow: Monthly timesheet - 4 rows - Q3');
    expect(ws.A3).toBeUndefined();
    expect(ws.A4!.v).toBe('Id');
    const xml = await sheetXml(bytes);
    expect(xml).toContain('<mergeCell ref="A1:G1"/>');
    expect(xml).toContain('<mergeCell ref="A2:G2"/>');
  });
  it('sets the alignment, bold and size of a line, and a taller row for a larger size', async () => {
    const bytes = await buildPrintWorkbook([input({ print: withBlock() })]);
    const parts_ = await parts(bytes);
    const styles = parts_.get('xl/styles.xml')!;
    expect(styles).toContain('<sz val="14"/>');
    expect(styles).toContain('horizontal="center"');
    const xml = parts_.get('xl/worksheets/sheet1.xml')!;
    expect(xml).toMatch(/<row r="1"[^>]*ht="21"/);
    expect(xml).toMatch(/<row r="2"[^>]*ht="15"/);
  });
  it('prints the table that follows as before when there are no lines: the header row is row 1', async () => {
    const ws = read(await buildPrintWorkbook([input()])).Sheets.Report!;
    expect(ws.A1!.v).toBe('Id');
  });
  it('repeats the header row of the table, not the lines above it', async () => {
    const xml = (await parts(await buildPrintWorkbook([input({ print: withBlock() })]))).get('xl/workbook.xml')!;
    expect(xml).toMatch(/Report&apos;!\$4:\$4/);
  });
});

describe('the writer of a print layout: the signature block', () => {
  it('lays out the date line, the titles, the lines, the space to sign and the names under the table', async () => {
    const bytes = await buildPrintWorkbook([input({ print: withBlock() })]);
    const ws = read(bytes).Sheets.Report!;
    // header lines 1-2, blank 3, table header 4, rows 5-8, blank 9, then the block from row 10.
    expect(ws.A10!.v).toBe('Ngày 05 tháng 10 năm 2026');
    expect(ws.A11!.v).toBe('Người lập biểu');
    expect(ws.A12!.v).toBe('(Ký, ghi rõ họ tên)');
    expect(ws.A17!.v).toBe('An');
    expect(ws.F17!.v).toBe('Bình');
    expect(ws.D11!.v).toBe('Kế toán');
    expect(ws.D17).toBeUndefined();
    expect(signatureRows(withBlock())).toBe(1 + 2 + 4 + 1);
  });
  it('merges each signer over equal columns: 7 columns and 3 signers give 3, 2 and 2', async () => {
    expect(signerGroups(7, 3)).toEqual([{ from: 1, to: 3 }, { from: 4, to: 5 }, { from: 6, to: 7 }]);
    expect(signerGroups(2, 2)).toEqual([{ from: 1, to: 1 }, { from: 2, to: 2 }]);
    const xml = await sheetXml(await buildPrintWorkbook([input({ print: withBlock() })]));
    expect(xml).toContain('<mergeCell ref="A11:C11"/>');
    expect(xml).toContain('<mergeCell ref="D11:E11"/>');
    expect(xml).toContain('<mergeCell ref="F11:G11"/>');
    expect(xml).toContain('<mergeCell ref="A10:G10"/>');
  });
  it('widens the block to the number of signers when the table has fewer columns', async () => {
    const small: TableData = { columns: [{ name: 'A', type: 'text' }], rows: [['x']] };
    const print = { ...defaultPrintSettings(), signers: signers.slice(0, 2) };
    const bytes = await buildPrintWorkbook([input({ table: small, print })]);
    const ws = read(bytes).Sheets.Report!;
    expect(ws.A4!.v).toBe('Người lập biểu');
    expect(ws.B4!.v).toBe('Kế toán');
    expect((await parts(bytes)).get('xl/workbook.xml')).toMatch(/Report&apos;!\$A1:\$B10/);
  });
  it('writes no block without signers, and the name row only when a name is given', async () => {
    const none = await buildPrintWorkbook([input()]);
    expect(await sheetXml(none)).not.toContain('mergeCell');
    const noNames = { ...defaultPrintSettings(), signers: signers.map((s) => ({ ...s, name: '' })) };
    expect(signatureRows(noNames)).toBe(2 + 4);
  });
  it('extends the print area to the last row of the block', async () => {
    const xml = (await parts(await buildPrintWorkbook([input({ print: withBlock() })]))).get('xl/workbook.xml')!;
    expect(xml).toMatch(/Report&apos;!\$A1:\$G17/);
  });
});

describe('the writer of a print layout: the page break before the block', () => {
  const longTable = (n: number): TableData => ({ columns: [{ name: 'Id', type: 'text' }, { name: 'Name', type: 'text' }], rows: Array.from({ length: n }, (_, i) => [`E${i}`, 'x']) });
  const breaks = (xml: string): number[] => [...xml.matchAll(/<brk id="(\d+)"/g)].map((m) => Number(m[1]));
  const print = { ...defaultPrintSettings(), signers: signers.slice(0, 2) };
  // A4 portrait, normal margins: 733.9 points of height, 48 rows of 15 points.

  it('adds no break when the block fits on the last page', async () => {
    expect(breaks(await sheetXml(await buildPrintWorkbook([input({ table: longTable(20), print })])))).toEqual([]);
  });
  it('adds a break after the last row of the table when the block would be cut: the block opens the next page', async () => {
    // 1 header + 42 rows = 43 rows (645 points) + 15 gap + 6 rows of block (90) > 733.9.
    const xml = await sheetXml(await buildPrintWorkbook([input({ table: longTable(42), print })]));
    expect(breaks(xml)).toEqual([43]);
  });
  it('decides on the last page, not the first: a table of two pages with a few rows on the second needs no break', async () => {
    expect(breaks(await sheetXml(await buildPrintWorkbook([input({ table: longTable(60), print })])))).toEqual([]);
  });
  it('a bigger paper or landscape changes the answer: A3 portrait fits what A4 cut', async () => {
    const a3 = { ...print, paper: 'A3' as const };
    expect(breaks(await sheetXml(await buildPrintWorkbook([input({ table: longTable(42), print: a3 })])))).toEqual([]);
  });
});

describe('the writer of a print layout: the footer', () => {
  it('writes "Trang n/N" in Vietnamese and "Page n/N" in English, centred', async () => {
    const vi = await sheetXml(await buildPrintWorkbook([input()], 'vi'));
    expect(vi).toContain('<oddFooter>&amp;CTrang &amp;P/&amp;N</oddFooter>');
    const en = await sheetXml(await buildPrintWorkbook([input()], 'en'));
    expect(en).toContain('<oddFooter>&amp;CPage &amp;P/&amp;N</oddFooter>');
    expect(FOOTER.vi).toBe('&CTrang &P/&N');
  });
  it('writes no footer when the page numbers are off', async () => {
    const xml = await sheetXml(await buildPrintWorkbook([input({ print: { ...defaultPrintSettings(), pageNumbers: false } })]));
    expect(xml).not.toContain('oddFooter');
  });
});
