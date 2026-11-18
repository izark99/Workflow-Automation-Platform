import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string) => ({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');

/** Input file -> <step> (selected): the step reads the Input file at its first input; a test file is chosen; Configure is open. */
async function setup(page: Page, step: 'Lookup / Join' | 'Group by', data: string, inputName: RegExp) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Join test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, step);
  await panel(page).getByRole('button', { name: inputName }).press('ArrowDown');
  await page.getByRole('option', { name: /1\. Input file/ }).click();
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').setInputFiles(csv(data));
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
}
const preview = async (page: Page) => {
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
};
const chooseOption = async (page: Page, button: RegExp | string, option: string | RegExp) => {
  await panel(page).getByRole('button', { name: button }).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
};

test.describe('Lookup / Join', () => {
  const DATA = 'name,kind\nAnn,WEEK\nBob,MONTH\nCy,YEAR\n';
  async function configured(page: Page) {
    await setup(page, 'Lookup / Join', DATA, /^Input from, left input/);
    await chooseOption(page, /^Look up in/, 'Reference table: OT limits');
    await panel(page).getByRole('button', { name: 'Add key pair' }).click();
    await panel(page).getByRole('textbox', { name: 'Column in your data' }).fill('kind');
    await chooseOption(page, /^Column in the source/, 'period');
    await panel(page).getByRole('button', { name: 'Add column to bring' }).click();
    await chooseOption(page, /^Column to bring/, 'limit_hours');
    await panel(page).getByRole('textbox', { name: 'New name' }).fill('limit');
  }

  test('says what is still missing, and when the lookup is complete', async ({ page }) => {
    await setup(page, 'Lookup / Join', DATA, /^Input from, left input/);
    await expect(panel(page).getByRole('status').filter({ hasText: 'Still missing:' })).toContainText('right input');
    await chooseOption(page, /^Look up in/, 'Reference table: OT limits');
    await expect(panel(page).getByRole('status').filter({ hasText: 'Still missing:' })).toContainText('Add a key pair');
    await expect(panel(page).getByRole('status').filter({ hasText: 'Still missing:' })).toContainText('at least one column to bring');
    await panel(page).getByRole('button', { name: 'Add key pair' }).click();
    await panel(page).getByRole('textbox', { name: 'Column in your data' }).fill('kind');
    await chooseOption(page, /^Column in the source/, 'period');
    await panel(page).getByRole('button', { name: 'Add column to bring' }).click();
    await chooseOption(page, /^Column to bring/, 'limit_hours');
    await expect(panel(page).getByRole('status').filter({ hasText: 'The lookup is complete' })).toBeVisible();
  });

  test('looks up a reference table: matching rows get the brought column, others stay blank', async ({ page }) => {
    await configured(page);
    await preview(page);
    await expect(previewRows(page)).toHaveCount(3, { timeout: 30_000 });
    await expect(panel(page).getByRole('columnheader')).toHaveText(['name', 'kind', 'limit']);
    await expect(previewRows(page).nth(0)).toContainText('16');
    await expect(previewRows(page).nth(1)).toContainText('40');
    await expect(previewRows(page).nth(2).locator('td').nth(2)).toHaveText('');
  });

  test('"Drop the row" removes rows with no match; "Stop with an error" names the key that was not found', async ({ page }) => {
    await configured(page);
    await chooseOption(page, /^When no row matches/, 'Drop the row');
    await preview(page);
    await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
    await panel(page).getByRole('tab', { name: 'Configure' }).click();
    await chooseOption(page, /^When no row matches/, 'Stop with an error');
    await preview(page);
    await expect(panel(page).getByRole('alert')).toContainText('YEAR', { timeout: 30_000 });
  });

  test('with the columns loaded, the columns of your data are a dropdown; key pairs and brought columns can be removed', async ({ page }) => {
    await setup(page, 'Lookup / Join', DATA, /^Input from, left input/);
    await panel(page).getByRole('button', { name: 'Add key pair' }).click();
    await panel(page).getByRole('button', { name: 'Load columns of your data' }).click();
    await expect(panel(page).getByRole('button', { name: /^Column in your data/ })).toBeVisible({ timeout: 30_000 });
    await chooseOption(page, /^Column in your data/, 'kind');
    await expect(panel(page).getByRole('button', { name: /^Column in your data: kind/ })).toBeVisible();
    await panel(page).getByRole('button', { name: 'Remove key pair 1' }).click();
    await expect(panel(page).getByRole('button', { name: /^Column in your data/ })).toHaveCount(0);
  });
});

test.describe('Group by', () => {
  const DATA = 'dept,hours\nA,2\nA,3\nB,5\n';
  async function configured(page: Page) {
    await setup(page, 'Group by', DATA, /^Input from/);
    await panel(page).getByRole('textbox', { name: 'Column name' }).fill('dept');
    await panel(page).getByRole('button', { name: 'Add', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Add aggregation' }).click();
    await panel(page).getByRole('textbox', { name: 'Column 1' }).fill('hours');
    await panel(page).getByRole('textbox', { name: 'Result name 1' }).fill('total');
    await panel(page).getByRole('button', { name: 'Add aggregation' }).click();
    await chooseOption(page, /^Function 2/, 'count');
  }

  test('says what is still missing, then that the grouping is complete', async ({ page }) => {
    await setup(page, 'Group by', DATA, /^Input from/);
    await expect(panel(page).getByRole('status').filter({ hasText: 'Still missing:' })).toContainText('Add a group column or an aggregation');
    await panel(page).getByRole('textbox', { name: 'Column name' }).fill('dept');
    await panel(page).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(panel(page).getByRole('status').filter({ hasText: 'The grouping is complete' })).toBeVisible();
    await panel(page).getByRole('button', { name: 'Add aggregation' }).click();
    await expect(panel(page).getByRole('status').filter({ hasText: 'Choose the column to sum.' })).toBeVisible();
  });

  test('groups and aggregates a real preview: sum of hours as total, and a count', async ({ page }) => {
    await configured(page);
    await preview(page);
    await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
    await expect(panel(page).getByRole('columnheader')).toHaveText(['dept', 'total', 'count']);
    await expect(previewRows(page).nth(0)).toContainText('A');
    await expect(previewRows(page).nth(0).locator('td').nth(1)).toHaveText('5');
    await expect(previewRows(page).nth(0).locator('td').nth(2)).toHaveText('2');
    await expect(previewRows(page).nth(1).locator('td').nth(2)).toHaveText('1');
  });

  test('with the columns loaded, group columns are added from a dropdown and removed with the chip button', async ({ page }) => {
    await setup(page, 'Group by', DATA, /^Input from/);
    await panel(page).getByRole('button', { name: 'Load columns from test file' }).click();
    await expect(panel(page).getByRole('button', { name: /^Add to Group columns/ })).toBeVisible({ timeout: 30_000 });
    await chooseOption(page, /^Add to Group columns/, 'dept');
    await expect(panel(page).getByRole('group', { name: 'Group columns' })).toContainText('dept');
    await panel(page).getByRole('button', { name: 'Remove dept from Group columns' }).click();
    await expect(panel(page).getByRole('group', { name: 'Group columns' })).toContainText('No column chosen yet.');
  });

  test('a sum of a text column is refused by the engine with what to do', async ({ page }) => {
    await setup(page, 'Group by', DATA, /^Input from/);
    await panel(page).getByRole('button', { name: 'Add aggregation' }).click();
    await panel(page).getByRole('textbox', { name: 'Column 1' }).fill('dept');
    await preview(page);
    await expect(panel(page).getByRole('alert')).toContainText('needs a number column', { timeout: 30_000 });
  });
});
