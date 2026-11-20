import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clearLayouts } from '../scripts/lib/layout-fixtures';
import { REF_FLOW, seedReferenceStep } from './reference-step-flow';

// T6.19: the run says what is wrong, or doubtful, with an Input file: a file that lacks a required column, a stop text that is
// never found, a header row past the end of the sheet. Each is checked on the Run screen and in the Test tab.
const layout = clearLayouts().find((l) => l.name === 'title-and-footer (csv)')!;
const file = { name: layout.file.name, mimeType: 'text/csv', buffer: Buffer.from(layout.file.bytes) };
const good = { key: 'people', headerRow: 5, firstColumn: 'A', lastColumn: 'F', stopAt: { kind: 'marker', text: 'Prepared by', match: 'starts_with', column: 'Code' } };

const nodes = (settings: Record<string, unknown>) => [
  { id: 'in', type: 'input_file', label: 'People', position: { x: 0, y: 0 }, settings },
  { id: 'out', type: 'output', label: 'Result', position: { x: 0, y: 160 }, settings: { file: 'Result', format: 'xlsx', sheet: 'Rows' } },
];
const edges = [{ source: 'in', target: 'out' }];

async function onRunScreen(page: Page, settings: Record<string, unknown>) {
  await page.clock.setFixedTime(new Date('2026-11-17T09:00:00+07:00'));
  await seedReferenceStep(page, { status: 'published', nodes: nodes(settings), edges });
  await page.goto('/flows/flow-refstep/run');
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: /^Run flow$|^Chạy luồng$/ }).click();
}

async function onTestTab(page: Page, settings: Record<string, unknown>) {
  await seedReferenceStep(page, { nodes: nodes(settings), edges });
  await page.goto(REF_FLOW);
  await page.locator('.react-flow__node').first().click();
  const panel = page.getByRole('complementary', { name: 'Step settings' });
  await panel.getByRole('tab', { name: 'Test' }).click();
  await panel.locator('input[type=file]').setInputFiles(file);
  await panel.getByRole('button', { name: 'Preview first rows' }).click();
  return panel;
}

test('a file that lacks a required column stops the run and names the column and what the file has (Run screen)', async ({ page }) => {
  await onRunScreen(page, { ...good, expect: ['Code', 'Stock level'] });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('The run could not finish.', { timeout: 60_000 });
  await expect(alert).toContainText('lacks "Stock level", which this step requires');
  await expect(alert).toContainText('The file has: Code, Label, Group, Amount, Day, Text day');
  await expect(alert).toContainText('Choose the right file or sheet');
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toHaveCount(0);
});

test('a file that lacks a required column: the same message in the Test tab', async ({ page }) => {
  const panel = await onTestTab(page, { ...good, expect: ['Code', 'Stock level'] });
  const alert = panel.getByRole('alert');
  await expect(alert).toContainText('The preview could not run.', { timeout: 30_000 });
  await expect(alert).toContainText('lacks "Stock level"');
  await expect(alert).toContainText('The file has: Code, Label');
});

test('the message about a missing column is in Vietnamese when the language is Vietnamese', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dfw.locale', 'vi'));
  await onRunScreen(page, { ...good, expect: ['Code', 'Stock level'] });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('thiếu "Stock level"', { timeout: 60_000 });
  await expect(alert).toContainText('Tệp có các cột: Code, Label');
});

test('a stop text that is never found does not stop the run: all rows are read and a warning says so (Run screen)', async ({ page }) => {
  await onRunScreen(page, { ...good, stopAt: { kind: 'marker', text: 'No such footer', match: 'contains' } });
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  const warning = page.getByRole('status').filter({ hasText: 'was not found' });
  await expect(warning).toContainText('The stop text "No such footer" was not found');
  await expect(warning).toContainText('all rows to the end were read');
  await expect(warning).toContainText('Check the text in the settings of the step "in"');
  // More rows than the table has were read (the footer lines too), so the sheet has more than the 6 rows of the table.
  await expect(page.getByRole('tab', { name: /^Rows, (\d+) rows$/ })).not.toHaveText('Rows, 6 rows');
});

test('a stop text that is found gives no warning (Run screen)', async ({ page }) => {
  await onRunScreen(page, good);
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('tab', { name: 'Rows, 6 rows' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'was not found' })).toHaveCount(0);
});

test('a stop text that is never found: the warning is in the Test tab too, above the rows', async ({ page }) => {
  const panel = await onTestTab(page, { ...good, stopAt: { kind: 'marker', text: 'No such footer', match: 'contains' } });
  const warning = panel.getByRole('status').filter({ hasText: 'was not found' });
  await expect(warning).toContainText('all rows to the end were read', { timeout: 30_000 });
  const rows = panel.getByRole('table', { name: 'Preview rows' });
  await expect(rows).toBeVisible();
  const [w, r] = [await warning.boundingBox(), await rows.boundingBox()];
  expect(w!.y).toBeLessThan(r!.y);
});

test('a header row past the end of the sheet stops the run and says which row and what to do (Run screen)', async ({ page }) => {
  await onRunScreen(page, { ...good, headerRow: 500 });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('The run could not finish.', { timeout: 60_000 });
  await expect(alert).toContainText('has no data at header row 500');
  await expect(alert).toContainText('Type the number of the row that holds the column names');
  await expect(alert).toContainText('step "in"');
});

test('a header row past the end of the sheet: the same message in the Test tab', async ({ page }) => {
  const panel = await onTestTab(page, { ...good, headerRow: 500 });
  const alert = panel.getByRole('alert');
  await expect(alert).toContainText('The preview could not run.', { timeout: 30_000 });
  await expect(alert).toContainText('has no data at header row 500');
});
