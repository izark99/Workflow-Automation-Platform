import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// T8.12b: Split column (SPEC 15.4 item 4), with Vietnamese names.
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string) => ({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');
const group = (page: Page, name: string) => panel(page).getByRole('group', { name });
const DATA = 'id,name,hours\n1,Nguyễn Văn An,5\n2,Đặng Thị Hồng Nhung,6\n3,Bình,7\n4,,8\n';

async function splitStep(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Split test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, 'Split column');
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').first().setInputFiles(csv(DATA));
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
}
const addName = async (page: Page, name: string) => {
  await group(page, 'Names of the new columns').getByRole('textbox', { name: 'Column name' }).fill(name);
  await group(page, 'Names of the new columns').getByRole('button', { name: 'Add', exact: true }).click();
};
const chooseOption = async (page: Page, button: RegExp | string, option: string | RegExp) => {
  await panel(page).getByRole('button', { name: button }).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
};

test('a new step says what is still missing, with the column loaded from the test file', async ({ page }) => {
  await splitStep(page);
  await expect(panel(page).getByRole('status').filter({ hasText: 'Choose the text column to split.' })).toBeVisible();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Add the name of at least one new column.' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Load columns from test file' }).click();
  // Only the text column is offered.
  await panel(page).getByRole('button', { name: /^Text column to split/ }).click();
  await expect(page.getByRole('option', { name: 'name', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'hours', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'name', exact: true }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Choose the text column to split.' })).toHaveCount(0);
});

test('a Vietnamese full name cut at the last space: family and middle names, and the given name', async ({ page }) => {
  await splitStep(page);
  await panel(page).getByRole('textbox', { name: 'Text column to split' }).fill('name');
  await chooseOption(page, /^Cut at/, 'The last space');
  await addName(page, 'Family and middle');
  await addName(page, 'Given');
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(4, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['id', 'Family and middle', 'Given', 'hours']);
  const row = async (i: number) => Promise.all([1, 2].map((c) => previewRows(page).nth(i).locator('td').nth(c).textContent()));
  expect(await row(0)).toEqual(['Nguyễn Văn', 'An']);
  expect(await row(1)).toEqual(['Đặng Thị Hồng', 'Nhung']);
  expect(await row(2)).toEqual(['Bình', '']);
  expect(await row(3)).toEqual(['', '']);
});

test('keep the original, cut at a given text, and a new name that exists is shown with what to do', async ({ page }) => {
  await splitStep(page);
  await panel(page).getByRole('button', { name: 'Load columns from test file' }).click();
  await panel(page).getByRole('button', { name: /^Text column to split/ }).click();
  await page.getByRole('option', { name: 'name', exact: true }).click();
  await chooseOption(page, /^Cut at/, 'Every given text');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Type the text to cut at.' })).toBeVisible();
  await panel(page).getByRole('textbox', { name: 'Text to cut at' }).fill(' ');
  await addName(page, 'hours');
  await expect(panel(page).getByRole('alert').filter({ hasText: 'A column named hours already exists' })).toBeVisible();
  await group(page, 'Names of the new columns').getByRole('button', { name: /^Remove hours/ }).click();
  await addName(page, 'First');
  await addName(page, 'Second');
  await panel(page).getByRole('checkbox', { name: 'Keep the original column' }).click();
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(4, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['id', 'name', 'First', 'Second', 'hours']);
});

test('a column that is not text is refused by the preview with what to do', async ({ page }) => {
  await splitStep(page);
  await panel(page).getByRole('textbox', { name: 'Text column to split' }).fill('hours');
  await addName(page, 'A');
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(panel(page).getByRole('alert')).toContainText('only a text column can be split', { timeout: 30_000 });
});
