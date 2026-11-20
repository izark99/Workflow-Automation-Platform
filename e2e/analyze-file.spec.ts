import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ambiguousLayouts, clearLayouts, type Layout } from '../scripts/lib/layout-fixtures';
import { REF_FLOW, seedReferenceStep } from './reference-step-flow';

// T6.18b: "Analyze file" on the Test tab of an Input step. The files are made by the generator of the layouts.
const settings = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const layout = (name: string): Layout => [...clearLayouts(), ...ambiguousLayouts()].find((l) => l.name === name)!;
const upload = (l: Layout) => ({ name: l.file.name, mimeType: l.format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(l.file.bytes) });
const result = (page: Page) => settings(page).getByRole('group', { name: 'Result of the analysis' });
const line = (page: Page, label: string) => result(page).getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) });

async function openTest(page: Page) {
  await seedReferenceStep(page, { nodes: [{ id: 'in', type: 'input_file', label: 'People', position: { x: 0, y: 0 }, settings: { key: 'people', headerRow: 1 } }] });
  await page.goto(REF_FLOW);
  await page.locator('.react-flow__node').first().click();
  await settings(page).getByRole('tab', { name: 'Test' }).click();
}
const choose = (page: Page, l: Layout) => settings(page).locator('input[type=file]').setInputFiles(upload(l));
const analyze = (page: Page) => settings(page).getByRole('button', { name: 'Analyze file', exact: true });

test('with no test file the button is off and says what to do', async ({ page }) => {
  await openTest(page);
  await expect(analyze(page)).toBeDisabled();
  await expect(settings(page).getByText('Choose a test file first.')).toBeVisible();
  await choose(page, layout('title-and-footer (xlsx)'));
  await expect(analyze(page)).toBeEnabled();
  await expect(settings(page).getByText('Choose a test file first.')).toHaveCount(0);
});

test('the result shows each proposed setting with its confidence and a reason, what is left out, and a preview with the region marked', async ({ page }) => {
  await openTest(page);
  await choose(page, layout('title-and-footer (xlsx)'));
  await analyze(page).click();
  await expect(result(page)).toBeVisible();
  const value = (label: string) => line(page, label).locator('span').nth(1);
  await expect(value('Sheet name')).toHaveText('Report');
  await expect(value('Header row')).toHaveText('5');
  await expect(value('First column of the table')).toHaveText('A');
  await expect(value('Last column of the table')).toHaveText('F');
  await expect(value('Stop reading at')).toHaveText('A row whose column Code starts with "Prepared by"');
  await expect(value('Columns the file must have')).toHaveText('Code, Label, Group, Amount, Day, Text day');
  await expect(line(page, 'Header row')).toContainText('High');
  await expect(line(page, 'Fill down these columns')).toContainText('None');
  // The reason is behind the info button.
  await line(page, 'Header row').getByRole('button', { name: 'About Header row' }).click();
  await expect(page.getByText('Row 5 has 6 different names, and rows of data follow it.')).toBeVisible();
  await page.keyboard.press('Escape');
  // What is left out.
  await expect(result(page).getByText('Rows 1 to 3: title')).toBeVisible();
  await expect(result(page).getByText('Rows 12 to 14: footer')).toBeVisible();
  // The preview: row numbers, the header bold, the rows outside the region dimmed and named for a screen reader.
  const preview = result(page).getByRole('region', { name: 'Preview of the first rows of the sheet' });
  await expect(preview).toBeVisible();
  await preview.focus();
  await expect(preview).toBeFocused();
  const rows = preview.getByRole('table').locator('tbody tr');
  await expect(rows).toHaveCount(14);
  await expect(rows.nth(0)).toContainText('Left out');
  await expect(rows.nth(4)).not.toContainText('Left out');
  await expect(rows.nth(4)).toContainText('Code');
  expect(await rows.nth(4).locator('td').nth(1).locator('span').evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700');
  expect(await rows.nth(0).locator('td').nth(1).locator('span').evaluate((el) => getComputedStyle(el).opacity)).toBe('0.5');
  // Nothing was applied by itself.
  await settings(page).getByRole('tab', { name: 'Configure' }).click();
  await expect(settings(page).getByRole('textbox', { name: 'Header row', exact: true })).toHaveValue('1');
});

test('Apply to the step fills the Configure tab, and the table is then read: analyze, apply and preview', async ({ page }) => {
  await openTest(page);
  await choose(page, layout('later-row-and-column (xlsx)'));
  await analyze(page).click();
  await result(page).getByRole('button', { name: 'Apply to the step' }).click();
  // The Configure tab is shown, with the proposal in it.
  await expect(settings(page).getByRole('tab', { name: 'Configure', selected: true })).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(settings(page).getByRole('textbox', { name: 'Header row', exact: true })).toHaveValue('4');
  await expect(settings(page).getByRole('textbox', { name: 'First column of the table' })).toHaveValue('C');
  await expect(settings(page).getByRole('textbox', { name: 'Last column of the table' })).toHaveValue('H');
  await expect(settings(page).getByRole('button', { name: /^Stop reading at: A row that has a text/ })).toBeVisible();
  await expect(settings(page).getByRole('group', { name: 'Columns the file must have' }).getByText('Amount', { exact: true })).toBeVisible();
  // Back on the Test tab, the step reads the table of the file: 5 rows, with the real columns.
  await settings(page).getByRole('tab', { name: 'Test' }).click();
  await settings(page).getByRole('button', { name: 'Preview first rows' }).click();
  const table = settings(page).getByRole('table', { name: 'Preview rows' });
  await expect(table.getByRole('columnheader')).toHaveText(['Code', 'Label', 'Group', 'Amount', 'Day', 'Text day'], { timeout: 30_000 });
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(table.locator('tbody tr').first()).toContainText('K001');
});

test('a csv file with a title and a footer is analysed too, with no sheet line', async ({ page }) => {
  await openTest(page);
  await choose(page, layout('vietnamese-footer (csv)'));
  await analyze(page).click();
  await expect(result(page)).toBeVisible();
  await expect(line(page, 'Sheet name')).toHaveCount(0);
  await expect(line(page, 'Header row')).toContainText('3');
  await expect(line(page, 'Stop reading at')).toContainText('starts with "Ngày"');
});

test('an ambiguous file shows low confidence and the other table, and applies nothing by itself', async ({ page }) => {
  await openTest(page);
  await choose(page, layout('two-tables (xlsx)'));
  await analyze(page).click();
  await expect(line(page, 'Header row')).toContainText('Low');
  await line(page, 'Header row').getByRole('button', { name: 'About Header row' }).click();
  await expect(page.getByText('The sheet holds 2 tables. Row 2 is the header of the first one.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(result(page).getByText(/Rows 10 to 13, columns A to D: another table/)).toBeVisible();
  // Close leaves the step as it was.
  await result(page).getByRole('button', { name: 'Close' }).click();
  await expect(result(page)).toHaveCount(0);
  await settings(page).getByRole('tab', { name: 'Configure' }).click();
  await expect(settings(page).getByRole('textbox', { name: 'Header row', exact: true })).toHaveValue('1');
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
});

test('a file with no table says so and offers nothing to apply', async ({ page }) => {
  await openTest(page);
  await choose(page, layout('text-only (csv)'));
  await analyze(page).click();
  await expect(settings(page).getByText('No table found. Set the header row by hand.')).toBeVisible();
  await expect(settings(page).getByRole('button', { name: 'Apply to the step' })).toHaveCount(0);
  await settings(page).getByRole('button', { name: 'Close' }).click();
  await expect(settings(page).getByText('No table found.')).toHaveCount(0);
});

test('an empty csv file holds no table', async ({ page }) => {
  await openTest(page);
  await settings(page).locator('input[type=file]').setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('') });
  await analyze(page).click();
  await expect(settings(page).getByText('No table found. Set the header row by hand.')).toBeVisible();
});

test('a file that cannot be read says what failed and what to do', async ({ page }) => {
  await openTest(page);
  await settings(page).locator('input[type=file]').setInputFiles({ name: 'notes.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a table') });
  await analyze(page).click();
  const alert = settings(page).getByRole('alert');
  await expect(alert).toContainText('The file could not be analyzed.');
  await expect(alert).toContainText('.xlsx or .csv');
  await alert.getByRole('button', { name: 'Close' }).click();
  await expect(settings(page).getByRole('alert')).toHaveCount(0);
});

test('Cancel stops the reading: the button comes back and no result is shown', async ({ page }) => {
  await openTest(page);
  // A csv of about 120 MB takes long enough to read for the button to be pressed.
  const dir = mkdtempSync(join(tmpdir(), 'dfw-analyze-'));
  const path = join(dir, 'big.csv');
  writeFileSync(path, Buffer.alloc(120 * 1024 * 1024, 'alpha,beta,gamma,delta,epsilon,zeta,eta,theta\n'));
  try {
    await settings(page).locator('input[type=file]').setInputFiles(path);
    await analyze(page).click();
    await expect(settings(page).getByRole('progressbar', { name: 'Reading the file' })).toBeVisible();
    await settings(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(settings(page).getByRole('progressbar')).toHaveCount(0);
    await expect(analyze(page)).toBeEnabled();
    await page.waitForTimeout(1500); // the cancelled read must not show a result afterwards
    await expect(result(page)).toHaveCount(0);
    await expect(settings(page).getByRole('alert')).toHaveCount(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the analysis sends no request that carries file content', async ({ page }) => {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(`${r.method()} ${r.url()} ${r.postData() ?? ''}`));
  await openTest(page);
  const csv = 'Code,Label,Amount\nZEBRA-4711,Item,5\nK2,Other,6\n';
  await settings(page).locator('input[type=file]').setInputFiles({ name: 'secret.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await analyze(page).click();
  await expect(result(page)).toBeVisible();
  expect(seen.filter((r) => r.includes('ZEBRA') || r.includes('secret.csv'))).toEqual([]);
  const origin = new URL(page.url()).origin;
  for (const r of seen) {
    const [method, url] = r.split(' ');
    if (url?.startsWith('blob:') || url?.startsWith('data:')) continue;
    expect(method).toBe('GET');
    expect(url?.startsWith(origin)).toBe(true);
  }
});
