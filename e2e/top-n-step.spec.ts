import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// T8.11: Top N (SPEC 15.4 item 3), alone and after a Sort.
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string) => ({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');
const group = (page: Page, name: string) => panel(page).getByRole('group', { name });
const DATA = 'id,dept,hours\n1,A,5\n2,B,9\n3,A,9\n4,A,5\n5,B,\n6,,7\n7,A,9\n8,B,3\n9,,7\n';

async function flowWith(page: Page, steps: string[]) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Top N test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  for (const s of steps) await addStep(page, s);
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').first().setInputFiles(csv(DATA));
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
}
const ids = async (page: Page) => {
  const n = await previewRows(page).count();
  return Promise.all(Array.from({ length: n }, (_, i) => previewRows(page).nth(i).locator('td').first().textContent()));
};
const preview = async (page: Page) => {
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
};
const chooseOption = async (page: Page, button: RegExp | string, option: string | RegExp) => {
  await panel(page).getByRole('button', { name: button }).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
};

test('the 3 largest by hours, ties cut by the order of the file', async ({ page }) => {
  await flowWith(page, ['Top N']);
  await expect(panel(page).getByRole('textbox', { name: 'Number of rows (N)' })).toHaveValue('10');
  await panel(page).getByRole('textbox', { name: 'Number of rows (N)' }).fill('3');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Choose the column or the formula' })).toBeVisible();
  await panel(page).getByRole('textbox', { name: 'Column to order by' }).fill('hours');
  await preview(page);
  await expect(previewRows(page)).toHaveCount(3, { timeout: 30_000 });
  expect(await ids(page)).toEqual(['2', '3', '7']);
});

test('the smallest, and the first rows in the current order', async ({ page }) => {
  await flowWith(page, ['Top N']);
  await panel(page).getByRole('textbox', { name: 'Number of rows (N)' }).fill('2');
  await chooseOption(page, /^Order:/, 'Smallest first');
  await panel(page).getByRole('textbox', { name: 'Column to order by' }).fill('hours');
  await preview(page);
  await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
  expect(await ids(page)).toEqual(['8', '1']);
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await chooseOption(page, /^Order:/, 'First rows in the current order');
  await expect(panel(page).getByRole('textbox', { name: 'Column to order by' })).toHaveCount(0);
  await preview(page);
  await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
  expect(await ids(page)).toEqual(['1', '2']);
});

test('a top N for each group', async ({ page }) => {
  await flowWith(page, ['Top N']);
  await panel(page).getByRole('textbox', { name: 'Number of rows (N)' }).fill('1');
  await panel(page).getByRole('textbox', { name: 'Column to order by' }).fill('hours');
  await group(page, 'Groups').getByRole('textbox', { name: 'Column name' }).fill('dept');
  await group(page, 'Groups').getByRole('button', { name: 'Add', exact: true }).click();
  await preview(page);
  await expect(previewRows(page)).toHaveCount(3, { timeout: 30_000 });
  expect(await ids(page)).toEqual(['3', '2', '6']);
});

test('an N that is not a whole number shows what to type, and a bad N is not saved', async ({ page }) => {
  await flowWith(page, ['Top N']);
  await panel(page).getByRole('textbox', { name: 'Number of rows (N)' }).fill('1.5');
  await expect(panel(page).getByRole('alert')).toContainText('whole number from 1 to 1,000,000');
  await panel(page).getByRole('textbox', { name: 'Number of rows (N)' }).fill('2');
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
});

test('Sort then Top N: sorted by hours descending, then the first 2 rows in the current order', async ({ page }) => {
  await flowWith(page, ['Sort']);
  await panel(page).getByRole('button', { name: 'Add sort key' }).click();
  await panel(page).getByRole('textbox', { name: 'Sort column 1' }).fill('hours');
  await chooseOption(page, /^Direction 1/, 'Descending');
  await addStep(page, 'Top N');
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await panel(page).getByRole('textbox', { name: 'Number of rows (N)' }).fill('4');
  await chooseOption(page, /^Order:/, 'First rows in the current order');
  await preview(page);
  await expect(previewRows(page)).toHaveCount(4, { timeout: 30_000 });
  expect(await ids(page)).toEqual(['2', '3', '7', '6']);
});
