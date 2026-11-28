import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Download } from '@playwright/test';
import * as XLSX from 'xlsx';
import { seedAllSteps } from './all-steps-flow';

// T8.16: a flow that uses all seven new steps runs end to end on the Run screen, and the workbook has the rows that the data says.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T09:00:00+07:00'));
});

const csv = (text: string, name: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
const NEW = 'id,name,hours\n1,"  đỗ   VĂN  hùng ",8\n2,Nguyễn   Thị Hằng,30\n3,ĐẶNG thị HỒNG,6\n3,ĐẶNG thị HỒNG,6\n4,Lê Minh,7\n5,Bình,2\n';
const OLD = 'id,name,hours\n1,Do Van Hung,8\n3,Dang Thi Hong,5\n4,Le Minh,7\n9,Gone Person,1\n';

async function saveDownload(download: Download): Promise<Uint8Array> {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'dfw-')), download.suggestedFilename());
  await download.saveAs(file);
  return new Uint8Array(readFileSync(file));
}

const sheet = (book: XLSX.WorkBook, name: string): unknown[][] => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name]!, { header: 1, blankrows: false, defval: null });

test('the flow of all seven new steps runs and writes the rows that the data says', async ({ page }) => {
  await seedAllSteps(page);
  await page.goto('/flows/flow-all-steps/run');
  await expect(page.getByRole('heading', { name: 'Run flow', level: 1 })).toBeVisible();
  const files = page.locator('input[type=file]');
  await files.nth(0).setInputFiles(csv(NEW, 'this-month.csv'));
  await files.nth(1).setInputFiles(csv(OLD, 'last-month.csv'));
  await page.getByRole('button', { name: /^Run flow$|^Run again$/ }).click();
  // The Check step says how many rows failed its rule.
  await expect(page.getByText('rule "Hours": rows that failed: 1')).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Result.xlsx' }).click()]);
  const book = XLSX.read(await saveDownload(download), { type: 'array', cellDates: true });
  expect(book.SheetNames).toEqual(['Passed', 'Errors', 'Changed', 'Removed rows', 'Gone']);
  // Clean text (Proper Case, spaces), Split column (last space), Remove duplicates (first id), Sort (hours descending), Top N (4 rows), Check.
  expect(sheet(book, 'Passed')).toEqual([
    ['id', 'Family', 'Given', 'hours'],
    [1, 'Đỗ Văn', 'Hùng', 8],
    [4, 'Lê', 'Minh', 7],
    [3, 'Đặng Thị', 'Hồng', 6],
  ]);
  expect(sheet(book, 'Errors')).toEqual([
    ['id', 'Family', 'Given', 'hours', 'Rule', 'Message'],
    [2, 'Nguyễn Thị', 'Hằng', 30, 'Hours', 'More than 24 hours.'],
  ]);
  expect(sheet(book, 'Removed rows')).toEqual([
    ['id', 'Family', 'Given', 'hours'],
    [3, 'Đặng Thị', 'Hồng', 6],
  ]);
  // Compare: Family and Given are not in the old table, so only hours is compared. Id 3 changed, id 9 is gone, nothing is new.
  expect(sheet(book, 'Changed')).toEqual([
    ['id', 'Changed columns', 'hours', 'hours (old)'],
    [3, 'hours', 6, 5],
  ]);
  expect(sheet(book, 'Gone')).toEqual([
    ['id', 'name', 'hours'],
    [9, 'Gone Person', 1],
  ]);
});
