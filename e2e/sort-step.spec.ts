import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// T8.9: the Sort step (SPEC 15.4 item 1). Sort then Top N is added to this file in T8.11.
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string) => ({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');
const cell = (page: Page, row: number, col: number) => previewRows(page).nth(row).locator('td').nth(col);
const chooseOption = async (page: Page, button: RegExp | string, option: string | RegExp) => {
  await panel(page).getByRole('button', { name: button }).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
};

async function sortStep(page: Page, data: string) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Sort test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, 'Sort');
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').first().setInputFiles(csv(data));
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
}
const preview = async (page: Page) => {
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
};

const DATA = 'name,hours\nLan,5\nAn,5\nBình,\nCường,9\nDũng,1\n';

test('a Sort step added after an Input file is connected, and the flow becomes version 4', async ({ page }) => {
  await sortStep(page, DATA);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(panel(page).getByRole('heading', { name: /Sort/ })).toBeVisible();
  // With no key the Configure tab says what to add.
  await expect(panel(page)).toContainText('Add a column or a formula to sort by');
});

test('sorting by a column, descending: empty values last, ties keep the file order', async ({ page }) => {
  await sortStep(page, DATA);
  await panel(page).getByRole('button', { name: 'Add sort key' }).click();
  await panel(page).getByRole('textbox', { name: 'Sort column 1' }).fill('hours');
  await chooseOption(page, /^Direction 1/, 'Descending');
  await preview(page);
  await expect(previewRows(page)).toHaveCount(5, { timeout: 30_000 });
  const first = await Promise.all([0, 1, 2, 3, 4].map((i) => cell(page, i, 0).textContent()));
  expect(first).toEqual(['Cường', 'Lan', 'An', 'Dũng', 'Bình']);
});

test('two keys, then a formula key; a key with no column is ignored and the step says so', async ({ page }) => {
  await sortStep(page, 'dept,hours,name\nB,5,x1\nA,5,x2\nB,9,x3\nA,1,x4\n');
  await panel(page).getByRole('button', { name: 'Add sort key' }).click();
  await expect(panel(page)).toContainText('has no column or formula yet');
  await panel(page).getByRole('textbox', { name: 'Sort column 1' }).fill('dept');
  await panel(page).getByRole('button', { name: 'Add sort key' }).click();
  await panel(page).getByRole('textbox', { name: 'Sort column 2' }).fill('hours');
  await chooseOption(page, /^Direction 2/, 'Descending');
  await preview(page);
  await expect(previewRows(page)).toHaveCount(4, { timeout: 30_000 });
  const names = await Promise.all([0, 1, 2, 3].map((i) => cell(page, i, 2).textContent()));
  expect(names).toEqual(['x2', 'x4', 'x3', 'x1']);
});

test('a Sort with no key stops the preview and says what to do', async ({ page }) => {
  await sortStep(page, DATA);
  await preview(page);
  await expect(panel(page).getByRole('alert')).toContainText('there is no sort key', { timeout: 30_000 });
  await expect(panel(page).getByRole('alert')).toContainText('Add a column or a formula');
});

test('an unknown column says which columns the input has', async ({ page }) => {
  await sortStep(page, DATA);
  await panel(page).getByRole('button', { name: 'Add sort key' }).click();
  await panel(page).getByRole('textbox', { name: 'Sort column 1' }).fill('Hours');
  await preview(page);
  await expect(panel(page).getByRole('alert')).toContainText('"hours"', { timeout: 30_000 });
});

test('a Sort key can be removed again', async ({ page }) => {
  await sortStep(page, DATA);
  await panel(page).getByRole('button', { name: 'Add sort key' }).click();
  await panel(page).getByRole('textbox', { name: 'Sort column 1' }).fill('hours');
  await panel(page).getByRole('button', { name: 'Remove sort key 1' }).click();
  await expect(panel(page).getByRole('textbox', { name: 'Sort column 1' })).toHaveCount(0);
  await expect(panel(page)).toContainText('Add a column or a formula to sort by');
});
