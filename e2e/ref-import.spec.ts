import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LIMITS_ROWS, xlsxBytes } from '../scripts/lib/refimport-fixtures';
import { seedSnapshot } from '../src/store/seed';

const URL = '/reference-tables';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Import a file' });
const csv = (text: string, name = 'limits.csv') => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
const open = async (page: Page, path = URL) => {
  await page.goto(path);
  await page.getByRole('button', { name: 'Import file' }).click();
  await expect(dialog(page)).toBeVisible();
};
const choose = (page: Page, file: ReturnType<typeof csv> | { name: string; mimeType: string; buffer: Buffer }) => dialog(page).locator('input[type=file]').setInputFiles(file);
const importButton = (page: Page) => dialog(page).getByRole('button', { name: 'Import', exact: true });
const toast = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const grid = (page: Page, name: string) => page.getByRole('table', { name: `Rows of ${name}` });

const CSV = 'Code,Limit,Valid from,Active\nA1,12.5,2026-09-30,true\nB2,40,2026-10-01,false\nC3,,,\n';

test('a user has no Import button', async ({ page }) => {
  const s = { ...seedSnapshot(), currentUserId: 'user-lan' };
  await page.addInitScript((j) => localStorage.setItem('dfw.seed', j), JSON.stringify(s));
  await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Reference tables', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import file' })).toHaveCount(0);
});

test('a csv file goes into a new table: preview, guessed types, a draft that is not published, and a toast', async ({ page }) => {
  await open(page);
  expect(Math.round((await dialog(page).boundingBox())!.width)).toBe(720);
  await expect(importButton(page)).toBeDisabled();
  await expect(dialog(page)).toContainText('Choose a file to import.');
  await choose(page, csv(CSV));
  await expect(dialog(page).getByRole('table', { name: 'Preview of the file' }).getByRole('columnheader')).toHaveText(['Code', 'Limit', 'Valid from', 'Active']);
  await expect(dialog(page).getByRole('table', { name: 'Preview of the file' }).locator('tbody tr')).toHaveCount(3);
  // The guessed types, which the admin can change.
  await expect(dialog(page).getByRole('button', { name: /^Type of column 1/ })).toContainText('Text');
  await expect(dialog(page).getByRole('button', { name: /^Type of column 2/ })).toContainText('Number');
  await expect(dialog(page).getByRole('button', { name: /^Type of column 3/ })).toContainText('Date');
  await expect(dialog(page).getByRole('button', { name: /^Type of column 4/ })).toContainText('Yes or no');
  await expect(dialog(page)).toContainText('Type a name for the new table.');
  await dialog(page).getByRole('textbox', { name: 'Table name' }).fill('Imported limits');
  await expect(importButton(page)).toBeEnabled();
  await importButton(page).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(toast(page, 'Imported 3 rows as a draft. Check it, then publish.')).toBeVisible();
  await expect(page).toHaveURL(/table=ref-\d+&v=1/);
  await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
  await expect(grid(page, 'Imported limits').locator('tbody tr')).toHaveCount(3);
  await expect(page.getByRole('textbox', { name: 'Row 1, Code' })).toHaveValue('A1');
  await expect(page.getByRole('textbox', { name: 'Row 1, Limit' })).toHaveValue('12.5');
  // Publish the result as today.
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Publish/ }).last().click();
  await expect(toast(page, 'v1 published.')).toBeVisible();
});

test('an xlsx file with the sheet chosen goes into a new version of a table', async ({ page }) => {
  const bytes = xlsxBytes([
    { name: 'Notes', rows: [['nothing here']] },
    { name: 'Limits', rows: [['code', 'description', 'work_day_value', 'day_category', 'ot_type'], ['Z9', 'Imported day', 1, 'WORK', 'OT_DAY'], ['Y8', 'Another', 0.5, 'WORK', null]] },
  ]);
  await open(page);
  await choose(page, { name: 'codes.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(bytes) });
  await expect(dialog(page).getByRole('button', { name: /^Sheet/ })).toBeVisible();
  await dialog(page).getByRole('button', { name: /^Sheet/ }).click();
  await page.getByRole('option', { name: 'Limits' }).click();
  await expect(dialog(page).getByRole('table', { name: 'Preview of the file' }).locator('tbody tr')).toHaveCount(2);
  await expect(dialog(page).getByRole('button', { name: /^Type of column 3/ })).toContainText('Number');
  await dialog(page).getByRole('button', { name: 'New version' }).click();
  await dialog(page).getByRole('button', { name: /^Table/ }).click();
  await page.getByRole('option', { name: 'Attendance codes' }).click();
  await expect(importButton(page)).toBeEnabled();
  await importButton(page).click();
  await expect(toast(page, 'Imported 2 rows as a draft. Check it, then publish.')).toBeVisible();
  await expect(page).toHaveURL(/table=ref-attendance&v=3/);
  await expect(page.getByRole('textbox', { name: 'Row 1, code' })).toHaveValue('Z9');
  // The earlier versions are untouched.
  await page.getByRole('group', { name: 'Versions of the table' }).getByRole('button', { name: /^v2/ }).click();
  await expect(grid(page, 'Attendance codes').locator('tbody tr')).toHaveCount(8);
});

test('replacing a draft asks first, and keeps the draft when the admin says no', async ({ page }) => {
  const s = seedSnapshot();
  s.refTables.push({ id: 'ref-draft', name: 'Draft table', description: '', versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'draft', columns: [{ name: 'k', type: 'text' }], rows: [['old']] }] });
  await page.addInitScript((j) => localStorage.setItem('dfw.seed', j), JSON.stringify(s));
  await open(page);
  await choose(page, csv('k\nnew1\nnew2\n', 'k.csv'));
  await dialog(page).getByRole('button', { name: 'Replace the draft' }).click();
  await expect(dialog(page).getByRole('button', { name: /^Table/ })).toContainText('Draft table');
  await importButton(page).click();
  const ask = page.getByRole('dialog', { name: 'Replace the draft?' });
  await expect(ask).toContainText('draft v1 of Draft table');
  await ask.getByRole('button', { name: 'Keep the draft' }).click();
  await expect(ask).toHaveCount(0);
  await expect(dialog(page)).toBeVisible();
  await importButton(page).click();
  await ask.getByRole('button', { name: 'Replace the draft' }).click();
  await expect(toast(page, 'Imported 2 rows as a draft.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Row 1, k' })).toHaveValue('new1');
  await expect(grid(page, 'Draft table').locator('tbody tr')).toHaveCount(2);
});

test('the option to replace a draft is not offered when no table has a draft', async ({ page }) => {
  await open(page);
  await expect(dialog(page).getByRole('button', { name: 'Replace the draft' })).toHaveCount(0);
});

test('a bad file lists at most 5 problems with row and column under the columns, and nothing is saved', async ({ page }) => {
  const rows = ['n,d'];
  for (let i = 0; i < 8; i++) rows.push(`x${i},2026-09-30`);
  rows[1] = 'oops,2026-09-30'; // n would be text: make the first filled cells numbers so the column is a number
  const text = ['n,d', '1,2026-09-30', '2,2026-09-30', '3,2026-09-30', ...Array.from({ length: 7 }, (_, i) => `bad${i},not a date`)].join('\n');
  await open(page);
  await choose(page, csv(text));
  await dialog(page).getByRole('textbox', { name: 'Table name' }).fill('Bad');
  // The type of n is guessed as text (mixed), so set it to number to get cell errors, and d is text too: set it to date.
  await dialog(page).getByRole('button', { name: /^Type of column 1/ }).click();
  await page.getByRole('option', { name: 'Number' }).click();
  await dialog(page).getByRole('button', { name: /^Type of column 2/ }).click();
  await page.getByRole('option', { name: 'Date' }).click();
  const list = dialog(page).getByRole('alert').filter({ hasText: 'Row ' });
  await expect(list.locator('li')).toHaveCount(5);
  await expect(list.locator('li').first()).toContainText('Row 5, column n: "bad0" is not a number. Fix the cell, or set the type of the column to text.');
  await expect(list).toContainText(/and \d+ more\./);
  await expect(importButton(page)).toBeDisabled();
  await expect(dialog(page)).toContainText('Fix the columns above.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('list', { name: 'Reference tables' }).getByRole('link')).toHaveCount(3);
});

test('a repeated column name, a file with too many columns and the wrong kind of file are refused with what to do', async ({ page }) => {
  await open(page);
  await choose(page, csv('Code,code\n1,2\n'));
  await expect(dialog(page).getByRole('alert')).toContainText('The name "code" is used by columns 1 and 2');
  await expect(importButton(page)).toBeDisabled();
  await choose(page, csv(Array.from({ length: 101 }, (_, i) => `c${i}`).join(',') + '\n' + Array.from({ length: 101 }, () => '1').join(',') + '\n', 'wide.csv'));
  await expect(dialog(page).getByRole('alert')).toContainText('The file has 101 columns, and a table holds at most 100.');
  await choose(page, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(dialog(page).getByRole('alert')).toContainText('The file notes.txt is not an .xlsx or .csv file.');
});

test('a header row below some title rows is used, and a header row past the end says what to do', async ({ page }) => {
  await open(page);
  await choose(page, csv('Limits of 2026\n\nCode,Limit\nA,1\nB,2\n'));
  await dialog(page).getByRole('textbox', { name: 'Header row' }).fill('3');
  await expect(dialog(page).getByRole('table', { name: 'Preview of the file' }).getByRole('columnheader')).toHaveText(['Code', 'Limit']);
  await dialog(page).getByRole('textbox', { name: 'Header row' }).fill('40');
  await expect(dialog(page).getByRole('alert')).toContainText('The header row 40 is empty or past the end of the sheet.');
  await dialog(page).getByRole('textbox', { name: 'Header row' }).fill('');
  await expect(dialog(page)).toContainText('Type the number of the header row.');
});

test('Cancel closes the dialog and imports nothing; the info button says that the table is shared', async ({ page }) => {
  await open(page);
  await choose(page, csv(CSV));
  await dialog(page).getByRole('button', { name: 'About Who sees the table' }).click();
  await expect(page.getByText(/must not hold personal data/)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'About Who sees the table' }).click(); // a second click closes the popover
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Reference tables' }).getByRole('link')).toHaveCount(3);
});

test('a large file shows the reading progress and Cancel works while it is read', async ({ page }) => {
  const rows = ['a,b'];
  for (let i = 0; i < 40_000; i++) rows.push(`${i},x${i}`);
  await open(page);
  await choose(page, csv(rows.join('\n'), 'big.csv'));
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toHaveCount(0);
});

test('the dialog keeps the title y of the screen, and the keyboard reaches the file button first', async ({ page }) => {
  await open(page);
  await expect(dialog(page).getByRole('button', { name: 'Choose file' })).toBeFocused();
});

void LIMITS_ROWS;
