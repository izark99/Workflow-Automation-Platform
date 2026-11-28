// T9.8: the journey of a print layout, from the browser: build it on the Summary sheet of the monthly timesheet flow, preview it,
// publish, run it on the September files, download the workbook and read it back. The files come from testcase/ in the test, never from src/.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { compareWorkbooks, formatComparison, readWorkbook } from '../scripts/lib/compare-workbooks';
import { sentinelForms } from '../scripts/lib/request-audit';
import { watchRequests } from '../acceptance/helpers';
import { readEntryText, readZipDirectory } from '../src/engine/xlsx-stream/zip';
import { DATASETS, pickDate, seedTimesheet } from './journey-data';

const TODAY = '2026-11-17';
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${TODAY}T09:00:00+07:00`));
});

const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const group = (page: Page) => panel(page).getByRole('group', { name: 'Print layout' });
const ds = DATASETS[0]!;

const cellText = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

test('journey 5: a print layout is built on the Summary sheet, previewed, published, run on the September files and downloaded', async ({ page }) => {
  test.setTimeout(300_000);
  const requests = watchRequests(page);
  await seedTimesheet(page, ds, { draft: true });
  await page.goto('/flows/flow-ts/versions/1');

  // Build: the Summary output gets the layout.
  await page.locator('.react-flow__node[data-id="out-summary"]').click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await group(page).getByRole('switch', { name: 'Print layout' }).click();
  await panel(page).getByRole('button', { name: /^Orientation/ }).click();
  await page.getByRole('option', { name: 'Landscape', exact: true }).click();
  await group(page).getByRole('button', { name: 'Add line' }).click();
  await panel(page).getByRole('textbox', { name: 'Header line 1' }).fill('BÁO CÁO CHẤM CÔNG THÁNG {month_year}');
  await group(page).getByRole('button', { name: 'Add line' }).click();
  await panel(page).getByRole('textbox', { name: 'Header line 2' }).fill('Luồng: {flow} - {rows} nhân viên');
  await panel(page).getByRole('textbox', { name: 'Date line' }).fill('Hà Nội, ngày {day} tháng {month} năm {year}');
  await group(page).getByRole('button', { name: 'Add signer' }).click();
  await panel(page).getByRole('textbox', { name: 'Signer title 1' }).fill('Người lập biểu');
  await group(page).getByRole('button', { name: 'Add signer' }).click();
  await panel(page).getByRole('textbox', { name: 'Signer title 2' }).fill('Giám đốc');
  await panel(page).getByRole('textbox', { name: 'Signer name (optional) 2' }).fill('Nguyễn Văn A');

  // Preview: the print preview shows the lines and the signers on a page.
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  // The files are asked for in the order of the Input steps of the flow: Timesheet, then Employees.
  for (const [i, file] of Object.values(ds.inputs).entries()) await panel(page).locator('input[type=file]').nth(i).setInputFiles(path.join(ds.dir, file));
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  const preview = panel(page).getByRole('region', { name: 'Print preview' });
  await expect(preview.getByRole('img').first()).toBeVisible({ timeout: 180_000 });
  await expect(preview.getByRole('img').first()).toContainText('BÁO CÁO CHẤM CÔNG THÁNG');
  // The builder does not need ExcelJS: it is not requested while the layout is built and previewed.
  expect(requests.filter((r) => /exceljs/i.test(r.url))).toEqual([]);

  // Publish and run on the September files.
  await page.getByRole('banner').getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog', { name: 'Publish v1?' }).getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'v1 published.' })).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'Run' }).click();
  await pickDate(page, /^Effective date:/, TODAY, ds.effectiveDate);
  for (const [key, file] of Object.entries(ds.inputs)) await page.locator(`input[aria-label="Choose file: ${key}"]`).setInputFiles(path.join(ds.dir, file));
  await page.getByRole('button', { name: 'Run flow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 240_000 });
  // The Run screen shows the badge beside the file that has a layout.
  const result = page.getByRole('button', { name: /^Download .*\.xlsx$/ }).locator('xpath=..');
  await expect(result).toContainText('Print layout');

  // Download and read the workbook back.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download .*\.xlsx$/ }).click()]);
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'dfw-')), download.suggestedFilename());
  await download.saveAs(file);
  const bytes = new Uint8Array(readFileSync(file));
  const actual = readWorkbook(bytes);
  const expected = readWorkbook(new Uint8Array(readFileSync(path.join(ds.dir, ds.expectedFile))));

  const read = (wb: XLSX.WorkBook, name: string, from = 0) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: null, blankrows: true }).slice(from);
  const summary = read(actual, 'Summary');
  expect(cellText(summary[0]![0])).toBe('BÁO CÁO CHẤM CÔNG THÁNG 09/2026');
  expect(cellText(summary[1]![0])).toMatch(/^Luồng: Timesheet journey - \d+ nhân viên$/);
  // The table starts at row 4 and equals the expected Summary sheet, cell by cell.
  const want = read(expected, 'Summary');
  const got = summary.slice(3, 3 + want.length);
  expect(got).toHaveLength(want.length);
  for (let r = 0; r < want.length; r++) for (let c = 0; c < want[r]!.length; c++) expect(cellText(got[r]?.[c]), `Summary row ${r + 1} column ${c + 1}`).toBe(cellText(want[r]![c]));
  // The block follows the table: the date line, the titles, the names.
  const rest = summary.slice(3 + want.length).flat().map(cellText);
  expect(rest.some((t) => /^Hà Nội, ngày \d{2} tháng \d{2} năm \d{4}$/.test(t))).toBe(true);
  expect(rest).toContain('Người lập biểu');
  expect(rest).toContain('Giám đốc');
  expect(rest).toContain('Nguyễn Văn A');
  // The other two sheets are as expected.
  const comparison = compareWorkbooks(expected, actual, ['Exceptions', 'OT_breaches']);
  expect(comparison.ok, formatComparison(comparison)).toBe(true);
  // The footer (the app is in English, so "Page n/N") and the page setup are in the file.
  const blob = new Blob([bytes as BlobPart]);
  const dir = await readZipDirectory(blob);
  const sheet1 = await readEntryText(blob, dir.get('xl/worksheets/sheet1.xml')!);
  expect(sheet1).toContain('orientation="landscape"');
  expect(sheet1).toContain('<oddFooter>&amp;CPage &amp;P/&amp;N</oddFooter>');

  // Privacy: ExcelJS was requested now, by the run; and no request carried a piece of the files.
  expect(requests.some((r) => /exceljs/i.test(r.url))).toBe(true);
  const origin = new URL(page.url()).origin;
  expect(requests.filter((r) => r.url.startsWith('http') && !r.url.startsWith(origin))).toEqual([]);
  expect(requests.filter((r) => r.postData)).toEqual([]);
  const marker = cellText(want[1]![1]);
  expect(marker.length).toBeGreaterThan(3);
  for (const form of sentinelForms(marker)) expect(requests.filter((r) => [r.url, ...Object.values(r.headers)].join('\n').includes(form))).toEqual([]);
});
