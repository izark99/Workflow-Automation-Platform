import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string) => ({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');
const cell = (page: Page, row: number, col: number) => previewRows(page).nth(row).locator('td').nth(col);
const group = (page: Page, name: string) => panel(page).getByRole('group', { name });

async function setup(page: Page, step: 'Unpivot' | 'Pivot', data: string) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Reshape test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, step);
  await panel(page).getByRole('button', { name: /^Input from/ }).press('ArrowDown');
  await page.getByRole('option', { name: /1\. Input file/ }).click();
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').setInputFiles(csv(data));
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
}
const preview = async (page: Page) => {
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
};
const addName = async (page: Page, list: string, name: string) => {
  await group(page, list).getByRole('textbox', { name: 'Column name' }).fill(name);
  await group(page, list).getByRole('button', { name: 'Add', exact: true }).click();
};
const chooseOption = async (page: Page, button: RegExp | string, option: string | RegExp) => {
  await panel(page).getByRole('button', { name: button }).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
};

test.describe('Unpivot', () => {
  const DATA = 'id,mon,tue\nA,1,2\nB,3,\n';
  async function configured(page: Page) {
    await setup(page, 'Unpivot', DATA);
    await addName(page, 'Columns to keep', 'id');
    await addName(page, 'Columns to unpivot', 'mon');
    await addName(page, 'Columns to unpivot', 'tue');
    await panel(page).getByRole('textbox', { name: 'Name column' }).fill('day');
    await panel(page).getByRole('textbox', { name: 'Value column' }).fill('hours');
  }

  test('starts with the names "name" and "value", and says what is missing until a column is chosen', async ({ page }) => {
    await setup(page, 'Unpivot', DATA);
    await expect(panel(page).getByRole('textbox', { name: 'Name column' })).toHaveValue('name');
    await expect(panel(page).getByRole('status').filter({ hasText: 'Still missing:' })).toContainText('Choose at least one column to unpivot');
    await addName(page, 'Columns to unpivot', 'mon');
    await expect(panel(page).getByRole('status').filter({ hasText: 'The unpivot is complete' })).toBeVisible();
  });

  test('turns the columns into rows (a real preview); skipping blank values drops a row', async ({ page }) => {
    await configured(page);
    await preview(page);
    await expect(previewRows(page)).toHaveCount(4, { timeout: 30_000 });
    await expect(panel(page).getByRole('columnheader')).toHaveText(['id', 'day', 'hours']);
    await expect(cell(page, 0, 1)).toHaveText('mon');
    await expect(cell(page, 3, 1)).toHaveText('tue');
    await panel(page).getByRole('tab', { name: 'Configure' }).click();
    await panel(page).getByRole('checkbox', { name: 'Skip rows whose value is blank' }).click();
    await preview(page);
    await expect(previewRows(page)).toHaveCount(3, { timeout: 30_000 });
  });

  test('a column cannot be in both lists: the refusal says where it is and what to do, and the list stays', async ({ page }) => {
    await setup(page, 'Unpivot', DATA);
    await addName(page, 'Columns to keep', 'id');
    await addName(page, 'Columns to unpivot', 'id');
    await expect(panel(page).getByRole('alert')).toContainText('"id" is already in the columns to keep. Remove it there first');
    await expect(group(page, 'Columns to unpivot')).toContainText('No column chosen yet.');
  });

  test('with the columns loaded, "Unpivot all other columns" fills the list; kept columns are not offered twice', async ({ page }) => {
    await setup(page, 'Unpivot', DATA);
    await panel(page).getByRole('button', { name: 'Load columns from test file' }).click();
    await expect(panel(page).getByRole('button', { name: /^Add to Columns to keep/ })).toBeVisible({ timeout: 30_000 });
    await chooseOption(page, /^Add to Columns to keep/, 'id');
    await panel(page).getByRole('button', { name: 'Unpivot all other columns' }).click();
    await expect(group(page, 'Columns to unpivot')).toContainText('mon');
    await expect(group(page, 'Columns to unpivot')).toContainText('tue');
    await expect(group(page, 'Columns to unpivot')).not.toContainText('id');
  });
});

test.describe('Pivot', () => {
  const DATA = 'dept,day,hours\nA,mon,2\nA,tue,3\nB,mon,5\n';
  async function configured(page: Page, data = DATA) {
    await setup(page, 'Pivot', data);
    await addName(page, 'Row keys', 'dept');
    await panel(page).getByRole('textbox', { name: 'Column whose values become columns' }).fill('day');
    await panel(page).getByRole('textbox', { name: 'Value column (not needed for count)' }).fill('hours');
  }

  test('says what is missing, then that the pivot is complete', async ({ page }) => {
    await setup(page, 'Pivot', DATA);
    await expect(panel(page).getByRole('status').filter({ hasText: 'Still missing:' })).toContainText('Choose the column whose values become the new columns');
    await panel(page).getByRole('textbox', { name: 'Column whose values become columns' }).fill('day');
    await expect(panel(page).getByRole('status').filter({ hasText: 'Still missing:' })).toContainText('Choose the value column to sum');
    await panel(page).getByRole('textbox', { name: 'Value column (not needed for count)' }).fill('hours');
    await expect(panel(page).getByRole('status').filter({ hasText: 'The pivot is complete' })).toBeVisible();
  });

  test('values become columns; a missing combination is 0 for sum, blank when the fill is "blank", or the number typed', async ({ page }) => {
    await configured(page);
    await preview(page);
    await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
    await expect(panel(page).getByRole('columnheader')).toHaveText(['dept', 'mon', 'tue']);
    await expect(cell(page, 0, 1)).toHaveText('2');
    await expect(cell(page, 1, 2)).toHaveText('0');
    await panel(page).getByRole('tab', { name: 'Configure' }).click();
    await panel(page).getByRole('textbox', { name: 'Fill value' }).fill('blank');
    await preview(page);
    await expect(cell(page, 1, 2)).toHaveText('', { timeout: 30_000 });
    await panel(page).getByRole('tab', { name: 'Configure' }).click();
    await panel(page).getByRole('textbox', { name: 'Fill value' }).fill('-1');
    await preview(page);
    await expect(cell(page, 1, 2)).toHaveText('-1', { timeout: 30_000 });
  });

  test('a fill value that is not a number shows what to do; prefix and suffix are kept as typed while the letter case changes the values', async ({ page }) => {
    await configured(page);
    await panel(page).getByRole('textbox', { name: 'Fill value' }).fill('abc');
    await expect(panel(page).getByRole('alert')).toContainText('"abc" is not a number. Type a number, the word blank');
    await panel(page).getByRole('textbox', { name: 'Fill value' }).fill('');
    await panel(page).getByRole('textbox', { name: 'Name prefix' }).fill('d_');
    await panel(page).getByRole('textbox', { name: 'Name suffix' }).fill('_h');
    await chooseOption(page, /^Letter case of the values/, 'UPPER CASE');
    await preview(page);
    await expect(panel(page).getByRole('columnheader')).toHaveText(['dept', 'd_MON_h', 'd_TUE_h'], { timeout: 30_000 });
  });

  test('the new columns can come from a reference table, in its order, including values with no data', async ({ page }) => {
    await configured(page, 'dept,day,hours\nA,OT_DAY,2\nA,OT_REST,3\n');
    await chooseOption(page, /^The new columns come from/, /^A reference table/);
    await chooseOption(page, /^Reference table/, 'OT types');
    await chooseOption(page, /^Column that lists the new columns/, 'ot_type');
    await preview(page);
    await expect(panel(page).getByRole('columnheader')).toHaveText(['dept', 'OT_DAY', 'OT_NIGHT', 'OT_REST', 'OT_HOLIDAY'], { timeout: 30_000 });
    await expect(cell(page, 0, 2)).toHaveText('0');
  });

  test('count needs no value column; an average of a text column gets the engine message', async ({ page }) => {
    await setup(page, 'Pivot', DATA);
    await addName(page, 'Row keys', 'dept');
    await panel(page).getByRole('textbox', { name: 'Column whose values become columns' }).fill('day');
    await chooseOption(page, /^Aggregation/, 'count');
    await expect(panel(page).getByRole('status').filter({ hasText: 'The pivot is complete' })).toBeVisible();
    await preview(page);
    await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
    await expect(cell(page, 0, 1)).toHaveText('1');
    await panel(page).getByRole('tab', { name: 'Configure' }).click();
    await chooseOption(page, /^Aggregation/, 'average');
    await panel(page).getByRole('textbox', { name: 'Value column (not needed for count)' }).fill('day');
    await preview(page);
    await expect(panel(page).getByRole('alert')).toContainText('average does not work on the text column', { timeout: 30_000 });
  });
});
