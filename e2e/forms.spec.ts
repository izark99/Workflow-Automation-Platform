import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string, name = 'data.csv') => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
const rows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');

async function newFlow(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Forms test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
}
async function setInputFrom(page: Page, optionPattern: RegExp) {
  await panel(page).getByRole('button', { name: /^Input from/ }).press('ArrowDown');
  await page.getByRole('option', { name: optionPattern }).click();
}
async function preview(page: Page, file?: ReturnType<typeof csv>) {
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  if (file) await panel(page).locator('input[type=file]').setInputFiles(file);
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
}

test('the Configure tab of an Input file step has the fields of the step; a bad number shows what to do and keeps the old setting', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Input file');
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  for (const label of ['File name on the run screen', 'Sheet name', 'Header row', 'Rows to skip after the header', 'Fill down these columns']) {
    await expect(panel(page).getByRole('textbox', { name: label })).toBeVisible();
  }
  await expect(panel(page).getByRole('checkbox', { name: 'Add a row number column' })).toHaveAttribute('aria-checked', 'false');
  const header = panel(page).getByRole('textbox', { name: 'Header row' });
  await header.fill('abc');
  await expect(panel(page).getByRole('alert')).toContainText('"abc" is not a row number. Type a whole number of 1 or more.');
  await header.fill('2');
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
});

test('header row and rows to skip decide where the table starts (checked by a real preview)', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Input file');
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await panel(page).getByRole('textbox', { name: 'Header row' }).fill('2');
  await panel(page).getByRole('textbox', { name: 'Rows to skip after the header' }).fill('1');
  await preview(page, csv('Monthly report\nname,age\n(units),(years)\nAnn,31\nBob,42\n'));
  await expect(rows(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['name', 'age']);
  await expect(rows(page).first()).toContainText('Ann');
});

test('fill down copies the value above into empty cells, and a row number column is added when ticked', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Input file');
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await panel(page).getByRole('textbox', { name: 'Fill down these columns' }).fill('id');
  await panel(page).getByRole('checkbox', { name: 'Add a row number column' }).click();
  await panel(page).getByRole('textbox', { name: 'Row number column name' }).fill('line');
  await preview(page, csv('id,v\nA,1\n,2\nB,3\n,4\n'));
  await expect(rows(page)).toHaveCount(4, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['id', 'v', 'line']);
  await expect(rows(page).nth(1)).toContainText('A');
  await expect(rows(page).nth(3)).toContainText('B');
});

test('two Input file steps cannot share one name', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Input file');
  await addStep(page, 'Input file');
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  const key = panel(page).getByRole('textbox', { name: 'File name on the run screen' });
  await key.fill('input_file-1');
  await expect(panel(page).getByRole('alert')).toContainText('Another Input file step already uses the name "input_file-1"');
  await key.fill('Employees');
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
});

test('the Filter condition is checked as you type, and it splits the rows into Match and No match', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Input file');
  await addStep(page, 'Filter');
  await setInputFrom(page, /1\. Input file/);
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  const cond = panel(page).getByRole('textbox', { name: 'Condition' });
  await expect(panel(page)).toContainText('The formula is empty');
  await cond.fill('[age] >');
  await expect(panel(page).getByRole('alert')).toContainText(/Character \d+:/);
  await cond.fill('[age] > 35');
  await expect(panel(page).getByRole('status').filter({ hasText: 'written correctly' })).toBeVisible();
  await preview(page, csv('name,age\nAnn,31\nBob,42\nCy,36\n'));
  await expect(rows(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(rows(page).first()).toContainText('Bob');
  await panel(page).getByRole('group', { name: 'Output of the step' }).getByRole('button', { name: 'No match', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(rows(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(rows(page).first()).toContainText('Ann');
});

test('a Filter whose condition is not true or false shows the engine message in the preview', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Input file');
  await addStep(page, 'Filter');
  await setInputFrom(page, /1\. Input file/);
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await panel(page).getByRole('textbox', { name: 'Condition' }).fill('[age] + 1');
  await preview(page, csv('name,age\nAnn,31\n'));
  await expect(panel(page).getByRole('alert')).toContainText('must give true or false', { timeout: 30_000 });
});

test('the forms are read-only for a published version', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/3');
  await page.locator('.react-flow__node').first().click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await expect(panel(page).getByText('This version is published and read-only')).toBeVisible();
});
