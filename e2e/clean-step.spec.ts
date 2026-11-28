import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// T8.13b: Clean text (SPEC 15.4 item 5), with Vietnamese text.
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string) => ({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');
const group = (page: Page, name: string) => panel(page).getByRole('group', { name });
const DATA = 'id,name,note\n1,"  đỗ   VĂN  hùng ",x\n2,Nguyễn   Thị Hằng,y\n3,,z\n4,ĐẶNG thị HỒNG,w\n';

async function cleanStep(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Clean test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, 'Clean text');
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').first().setInputFiles(csv(DATA));
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
}
const addColumn = async (page: Page, name: string) => {
  await group(page, 'Text columns to clean').getByRole('textbox', { name: 'Column name' }).fill(name);
  await group(page, 'Text columns to clean').getByRole('button', { name: 'Add', exact: true }).click();
};
const chooseOption = async (page: Page, button: RegExp | string, option: string | RegExp) => {
  await panel(page).getByRole('button', { name: button }).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
};
const names = async (page: Page, col: number) => {
  const n = await previewRows(page).count();
  return Promise.all(Array.from({ length: n }, (_, i) => previewRows(page).nth(i).locator('td').nth(col).textContent()));
};
const preview = async (page: Page) => {
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
};

test('a new step says what to add, and trim and collapse are on by default', async ({ page }) => {
  await cleanStep(page);
  await expect(panel(page).getByRole('status').filter({ hasText: 'Add at least one text column to clean.' })).toBeVisible();
  await expect(panel(page).getByRole('checkbox', { name: 'Trim the ends' })).toBeChecked();
  await expect(panel(page).getByRole('checkbox', { name: 'Collapse runs of spaces' })).toBeChecked();
  await expect(panel(page).getByRole('checkbox', { name: 'Remove Vietnamese marks' })).not.toBeChecked();
  await panel(page).getByRole('button', { name: 'Load columns from test file' }).click();
  // Only the text columns are offered; the dropdown lists them.
  await group(page, 'Text columns to clean').getByRole('button', { name: /^Add to/ }).click();
  await expect(page.getByRole('option', { name: 'name', exact: true })).toBeVisible();
});

test('Proper Case with the marks removed gives the plain name; spaces are cleaned; the empty name stays empty', async ({ page }) => {
  await cleanStep(page);
  await addColumn(page, 'name');
  await panel(page).getByRole('checkbox', { name: 'Remove Vietnamese marks' }).click();
  await chooseOption(page, /^Letter case/, 'Proper Case');
  await preview(page);
  await expect(previewRows(page)).toHaveCount(4, { timeout: 30_000 });
  expect(await names(page, 1)).toEqual(['Do Van Hung', 'Nguyen Thi Hang', '', 'Dang Thi Hong']);
  // The other columns are untouched.
  expect(await names(page, 2)).toEqual(['x', 'y', 'z', 'w']);
});

test('write to new columns with a suffix: the original stays, the new column follows it', async ({ page }) => {
  await cleanStep(page);
  await addColumn(page, 'name');
  await chooseOption(page, /^Write the result/, 'Write to new columns');
  await panel(page).getByRole('textbox', { name: 'Suffix of the new column' }).fill('_clean');
  await chooseOption(page, /^Letter case/, 'UPPER CASE');
  await preview(page);
  await expect(previewRows(page)).toHaveCount(4, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['id', 'name', 'name_clean', 'note']);
  expect((await names(page, 1))[0]).toBe('  đỗ   VĂN  hùng ');
  expect((await names(page, 2))[0]).toBe('ĐỖ VĂN HÙNG');
});

test('turning everything off says what to do, and the preview refuses with the same advice', async ({ page }) => {
  await cleanStep(page);
  await addColumn(page, 'name');
  await panel(page).getByRole('checkbox', { name: 'Trim the ends' }).click();
  await panel(page).getByRole('checkbox', { name: 'Collapse runs of spaces' }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Turn on at least one thing to clean' })).toBeVisible();
  await preview(page);
  await expect(panel(page).getByRole('alert')).toContainText('nothing is chosen to clean', { timeout: 30_000 });
});
