import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { REF_FLOW, seedReferenceStep } from './reference-step-flow';

// T6.12c: the Test tab shows what a bound setting gets, and a flow with bound settings runs with values from the Run screen.
const node = (id: string, type: string, label: string, y: number, settings: Record<string, unknown>) => ({ id, type, label, position: { x: 0, y }, settings });
const settings = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const boundGroup = (page: Page) => settings(page).getByRole('group', { name: 'Settings that use a parameter' });
async function openTest(page: Page) {
  await page.goto(REF_FLOW);
  await page.locator('.react-flow__node').first().click();
  await settings(page).getByRole('tab', { name: 'Test' }).click();
}

test('the Test tab shows the value that a bound setting will use, and follows the test value of the parameter', async ({ page }) => {
  await seedReferenceStep(page, {
    parameters: [{ key: 'sheet', label: 'Sheet to read', type: 'text', required: true, default: 'July' }],
    nodes: [node('in', 'input_file', 'People', 0, { key: 'people', sheet: { $param: 'sheet' }, headerRow: 1 })],
  });
  await openTest(page);
  await expect(boundGroup(page).getByText('Sheet name', { exact: true })).toBeVisible();
  await expect(boundGroup(page).getByText('Now: July')).toBeVisible();
  // The settings that hold a fixed value are not listed.
  await expect(boundGroup(page).getByText('Header row')).toHaveCount(0);
  await settings(page).getByRole('textbox', { name: 'Sheet to read' }).fill('August');
  await expect(boundGroup(page).getByText('Now: August')).toBeVisible();
});

test('a value that the setting cannot take is an error under the setting, with the step and what to do', async ({ page }) => {
  await seedReferenceStep(page, {
    parameters: [{ key: 'row', label: 'Header row number', type: 'number', required: true, default: 0 }],
    nodes: [node('in', 'input_file', 'People', 0, { key: 'people', headerRow: { $param: 'row' } })],
  });
  await openTest(page);
  const alert = boundGroup(page).getByRole('alert');
  await expect(alert).toContainText('People');
  await expect(alert).toContainText('whole number of 1 or more');
  await expect(boundGroup(page).getByText(/^Now:/)).toHaveCount(0);
});

test('a parameter with no value is an error under the setting', async ({ page }) => {
  await seedReferenceStep(page, {
    parameters: [{ key: 'sheet', label: 'Sheet to read', type: 'text', required: true }],
    nodes: [node('in', 'input_file', 'People', 0, { key: 'people', sheet: { $param: 'sheet' } })],
  });
  await openTest(page);
  await expect(boundGroup(page).getByRole('alert')).toContainText('needs a value');
  await settings(page).getByRole('textbox', { name: 'Sheet to read' }).fill('June');
  await expect(boundGroup(page).getByText('Now: June')).toBeVisible();
  await expect(boundGroup(page).getByRole('alert')).toHaveCount(0);
});

test('a deleted parameter is shown in the Test tab with its error', async ({ page }) => {
  await seedReferenceStep(page, {
    parameters: [{ key: 'other', label: 'Other', type: 'text', required: false }],
    nodes: [node('in', 'input_file', 'People', 0, { key: 'people', sheet: { $param: 'gone' } })],
  });
  await openTest(page);
  await expect(boundGroup(page).getByText('Parameter gone no longer exists')).toBeVisible();
  await expect(boundGroup(page).getByRole('alert')).toBeVisible();
});

test('a flow with bound settings runs with the values typed on the Run screen: the sheet, the header row, the file name and the output sheet', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T09:00:00+07:00'));
  await seedReferenceStep(page, {
    status: 'published',
    parameters: [
      { key: 'sheet', label: 'Sheet to read', type: 'text', required: true },
      { key: 'row', label: 'Header row number', type: 'number', required: true },
      { key: 'file', label: 'Report name', type: 'text', required: true },
      { key: 'out', label: 'Report sheet', type: 'text', required: true },
    ],
    nodes: [
      node('in', 'input_file', 'People', 0, { key: 'people', sheet: { $param: 'sheet' }, headerRow: { $param: 'row' } }),
      node('out', 'output', 'Result', 160, { file: { $param: 'file' }, format: 'xlsx', sheet: { $param: 'out' } }),
    ],
    edges: [{ source: 'in', target: 'out' }],
  });
  await page.goto('/flows/flow-refstep/run');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['wrong'], ['x']]), 'June');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['title'], ['name', 'hours'], ['Ann', 8], ['Bob', 6]]), 'July');
  const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
  await page.locator('input[type=file]').setInputFiles({ name: 'people.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  const run = page.getByRole('button', { name: /^Run flow$/ });
  await expect(run).toBeDisabled(); // the parameters have no values yet
  await page.getByRole('textbox', { name: 'Sheet to read' }).fill('July');
  await page.getByRole('textbox', { name: 'Header row number' }).fill('2');
  await page.getByRole('textbox', { name: 'Report name' }).fill('Hours report');
  await page.getByRole('textbox', { name: 'Report sheet' }).fill('Hours');
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('tab', { name: /^Hours, 2 rows$/ })).toBeVisible();
  const table = page.getByRole('table', { name: 'Preview of Hours' });
  await expect(table.getByRole('columnheader')).toHaveText(['name', 'hours']);
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Download Hours report.xlsx' })).toBeVisible();
});
