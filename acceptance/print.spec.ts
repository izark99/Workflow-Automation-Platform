import * as XLSX from 'xlsx';
import { expect, test } from '@playwright/test';
import { readEntryText, readZipDirectory } from '../src/engine/xlsx-stream/zip';
import { csvOf, lcg, pick, runGenerated } from './new-steps-kit';
import type { RunReply } from './page';

// G1 of Phase 9: a generated flow with a print layout runs through the real engine in Chromium, and the file is checked.

const NAMES = ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Minh Dũng', 'Đặng Thu Em'];
const columns = ['Id', 'Name', 'Hours', 'Day'];
const rand = lcg(11);
const rows = Array.from({ length: 120 }, (_, i) => [`E${String(i + 1).padStart(3, '0')}`, pick(rand, NAMES), Math.floor(rand() * 8) + 0.5, `2026-09-${String((i % 28) + 1).padStart(2, '0')}`]);
const file = { File: { name: 'people.csv', text: csvOf(columns, rows) } };

const print = {
  enabled: true,
  paper: 'A4',
  orientation: 'landscape',
  margins: 'narrow',
  fitWidth: true,
  repeatHeader: true,
  pageNumbers: true,
  header: [
    { text: 'DANH SÁCH THÁNG {month_year}', align: 'center', bold: true, size: 'large' },
    { text: 'Hiệu lực: {effective_date} - {rows} dòng', align: 'left', bold: false, size: 'normal' },
  ],
  dateLine: 'Ngày {day} tháng {month} năm {year}',
  signers: [
    { title: 'Người lập biểu', line: '(Ký, ghi rõ họ tên)', name: '' },
    { title: 'Giám đốc', line: '(Ký, ghi rõ họ tên)', name: '' },
  ],
};

const base = { inputs: ['File'], files: file, nodes: [], edges: [] };

function bytesOf(reply: RunReply): Uint8Array {
  if (!reply.ok) throw new Error(`The engine stopped (${reply.code}): ${reply.message}`);
  return new Uint8Array(Buffer.from(reply.files[0]!.base64, 'base64'));
}
async function part(bytes: Uint8Array, name: string): Promise<string> {
  const blob = new Blob([bytes as BlobPart]);
  return readEntryText(blob, (await readZipDirectory(blob)).get(name)!);
}

test.describe('Print layout', () => {
  test('the table equals the one of the same flow without a layout, and the lines, the page and the signers are in the file', async ({ page }) => {
    const plain = bytesOf(await runGenerated(page, { ...base, outputs: [{ sheet: 'Report', from: 'in_File' }] }));
    const printed = bytesOf(await runGenerated(page, { ...base, outputs: [{ sheet: 'Report', from: 'in_File', print }] }));
    const a = XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(plain, { type: 'array', cellDates: true }).Sheets.Report!, { header: 1, raw: true });
    const wb = XLSX.read(printed, { type: 'array', cellDates: true });
    const ws = wb.Sheets.Report!;
    // Two header lines, one blank row, then the table.
    const b = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, range: 3 }).slice(0, a.length);
    expect(b.length).toBe(a.length);
    for (let r = 0; r < a.length; r++) for (let c = 0; c < columns.length; c++) expect(String(b[r]?.[c] ?? ''), `row ${r} column ${c}`).toBe(String(a[r]?.[c] ?? ''));

    expect(ws.A1!.v).toBe('DANH SÁCH THÁNG 09/2026');
    expect(ws.A2!.v).toBe('Hiệu lực: 30/09/2026 - 120 dòng');
    // 120 rows of A4 landscape do not leave room for the block on the last page: it follows the last row (124) after a page break.
    expect(ws.A125!.v).toMatch(/^Ngày \d{2} tháng \d{2} năm \d{4}$/);
    expect(ws.A126!.v).toBe('Người lập biểu');
    expect(ws.C126!.v).toBe('Giám đốc');
    expect(ws.A127!.v).toBe('(Ký, ghi rõ họ tên)');

    const sheet = await part(printed, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('orientation="landscape"');
    expect(sheet).toContain('paperSize="9"');
    expect(sheet).toContain('fitToHeight="0"');
    expect(sheet).toContain('<mergeCell ref="A1:D1"/>');
    expect(sheet).toContain('<brk id="124"');
    expect(sheet).toContain('<oddFooter>&amp;CTrang &amp;P/&amp;N</oddFooter>');
    expect(await part(printed, 'xl/workbook.xml')).toMatch(/Print_Titles[^>]*>&apos;Report&apos;!\$4:\$4/);
  });

  test('a flow with two sheets: one with a layout, one without', async ({ page }) => {
    const bytes = bytesOf(await runGenerated(page, { ...base, outputs: [{ sheet: 'Report', from: 'in_File', print }, { sheet: 'Plain', from: 'in_File' }] }));
    const wb = XLSX.read(bytes, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Report', 'Plain']);
    expect(wb.Sheets.Plain!.A1!.v).toBe('Id');
    expect(wb.Sheets.Report!.A1!.v).toBe('DANH SÁCH THÁNG 09/2026');
  });

  // docs/PRINT_PERF.md measured 1.6 s to write 20,000 rows (the limit of a layout); the whole run through the engine has a budget of 30 s.
  test('a table of 20,000 rows is written within the budget, and the row after it is refused', async ({ page }) => {
    const big = Array.from({ length: 20_000 }, (_, i) => [`E${i + 1}`, 'x', (i % 8) + 0.5, '2026-09-01']);
    const started = Date.now();
    const printed = bytesOf(await runGenerated(page, { ...base, files: { File: { name: 'big.csv', text: csvOf(columns, big) } }, outputs: [{ sheet: 'Report', from: 'in_File', print }] }));
    expect(Date.now() - started).toBeLessThan(30_000);
    const ws = XLSX.read(printed, { type: 'array' }).Sheets.Report!;
    expect(ws.A4!.v).toBe('Id');
    expect(ws.A5!.v).toBe('E1');
    expect(ws.A20004!.v).toBe('E20000');
    const tooMany = [...big, ['E20001', 'x', 1, '2026-09-01']];
    const reply = await runGenerated(page, { ...base, files: { File: { name: 'big.csv', text: csvOf(columns, tooMany) } }, outputs: [{ sheet: 'Report', from: 'in_File', print }] });
    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.message).toContain('up to 20,000 rows');
  });
});
