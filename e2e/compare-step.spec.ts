import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// T8.15b: Compare (SPEC 15.4 item 7), with last month and this month.
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string, name: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');
const group = (page: Page, name: string) => panel(page).getByRole('group', { name });
const LAST = 'id,name,hours\nE1,Lan,8\nE2,An,5\nE3,Bình,7\nE4,Dũng,6\n';
const THIS = 'id,name,hours\nE1,Lan,8\nE2,An,9\nE3,Bình Minh,7\nE5,Hà,3\n';

/** Two Input files, then a Compare that reads the first as the new table and the second as the old one. */
async function compareStep(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Compare test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await addStep(page, 'Input file');
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await addStep(page, 'Compare');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  // Setup tab: the two inputs.
  await panel(page).getByRole('tab', { name: 'Setup' }).click();
  await panel(page).getByRole('button', { name: /^Input from, new table/ }).click();
  await page.getByRole('option', { name: /1\. Input file/ }).click();
  await panel(page).getByRole('button', { name: /^Input from, old table/ }).click();
  await page.getByRole('option', { name: /2\. Input file/ }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
}
const chooseFiles = async (page: Page) => {
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  const inputs = panel(page).locator('input[type=file]');
  await inputs.nth(0).setInputFiles(csv(THIS, 'this-month.csv'));
  await inputs.nth(1).setInputFiles(csv(LAST, 'last-month.csv'));
};
const preview = async (page: Page) => {
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
};
const addKey = async (page: Page) => {
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await panel(page).getByRole('button', { name: 'Add key' }).click();
  await panel(page).getByRole('textbox', { name: 'Key column in the new table 1' }).fill('id');
  await panel(page).getByRole('textbox', { name: 'Key column in the old table 1' }).fill('id');
};
const cellsOf = async (page: Page, col: number) => {
  const n = await previewRows(page).count();
  return Promise.all(Array.from({ length: n }, (_, i) => previewRows(page).nth(i).locator('td').nth(col).textContent()));
};

test('the card has two inputs and three outputs, and a new step says what is missing', async ({ page }) => {
  await compareStep(page);
  const card = page.locator('.react-flow__node').filter({ hasText: 'Compare' }).last();
  await expect(card.locator('.react-flow__handle.target')).toHaveCount(2);
  await expect(card.locator('.react-flow__handle.source')).toHaveCount(3);
  for (const name of ['added', 'removed', 'changed']) await expect(card).toContainText(name);
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Add at least one key.' })).toBeVisible();
});

test('last month against this month: the three outputs with their counts', async ({ page }) => {
  await compareStep(page);
  await addKey(page);
  await chooseFiles(page);
  await preview(page);
  const chips = group(page, 'Output of the step');
  await expect(chips.getByRole('button', { name: 'Added (1)' })).toBeVisible({ timeout: 30_000 });
  await expect(chips.getByRole('button', { name: 'Removed (1)' })).toBeVisible();
  await expect(chips.getByRole('button', { name: 'Changed (2)' })).toBeVisible();
  // Added: the row of E5. The first output is shown by default (added).
  await expect(previewRows(page)).toHaveCount(1);
  expect(await cellsOf(page, 0)).toEqual(['E5']);
  await chips.getByRole('button', { name: /^Removed/ }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(1, { timeout: 30_000 });
  expect(await cellsOf(page, 0)).toEqual(['E4']);
  await chips.getByRole('button', { name: /^Changed/ }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['id', 'Changed columns', 'name', 'name (old)', 'hours', 'hours (old)']);
  expect(await cellsOf(page, 1)).toEqual(['hours', 'name']);
  expect(await cellsOf(page, 4)).toEqual(['9', '7']);
  expect(await cellsOf(page, 5)).toEqual(['5', '7']);
  expect((await cellsOf(page, 2))[1]).toBe('Bình Minh');
  expect((await cellsOf(page, 3))[1]).toBe('Bình');
});

test('only the listed columns are compared', async ({ page }) => {
  await compareStep(page);
  await addKey(page);
  await panel(page).getByRole('checkbox', { name: 'Compare all columns that both tables have' }).click();
  await group(page, 'Columns to compare').getByRole('textbox', { name: 'Column name' }).fill('hours');
  await group(page, 'Columns to compare').getByRole('button', { name: 'Add', exact: true }).click();
  await chooseFiles(page);
  await preview(page);
  await panel(page).getByRole('group', { name: 'Output of the step' }).getByRole('button', { name: /^Changed/ }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['id', 'Changed columns', 'hours', 'hours (old)']);
});

test('a repeated key stops the preview and names the key and the table', async ({ page }) => {
  await compareStep(page);
  await addKey(page);
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  const inputs = panel(page).locator('input[type=file]');
  await inputs.nth(0).setInputFiles(csv(`${THIS}E1,Lan,8\n`, 'this-month.csv'));
  await inputs.nth(1).setInputFiles(csv(LAST, 'last-month.csv'));
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(panel(page).getByRole('alert')).toContainText('key E1 appears 2 times in the new table', { timeout: 30_000 });
});
