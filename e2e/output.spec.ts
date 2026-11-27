import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string) => ({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');
const cell = (page: Page, row: number, col: number) => previewRows(page).nth(row).locator('td').nth(col);
const group = (page: Page, name: string) => panel(page).getByRole('group', { name });

async function newFlow(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Output test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
}
async function inputThen(page: Page, step: 'Output' | 'SQL' | 'Append', data: string) {
  await newFlow(page);
  await addStep(page, 'Input file');
  await addStep(page, step);
  // The step was added with the Input file selected, so it is connected to it.
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').first().setInputFiles(csv(data));
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

test.describe('Output', () => {
  const DATA = 'name,age\nBob,42\nAnn,31\nCy,\n';

  test('starts with the file Result and the sheet Sheet1; a bad sheet name or an empty file name shows what to do', async ({ page }) => {
    await inputThen(page, 'Output', DATA);
    await expect(panel(page).getByRole('textbox', { name: 'File name' })).toHaveValue('Result');
    await expect(panel(page).getByRole('textbox', { name: 'Sheet name' })).toHaveValue('Sheet1');
    await panel(page).getByRole('textbox', { name: 'Sheet name' }).fill('a:b');
    await expect(panel(page).getByRole('alert')).toContainText('none of [ ] : * ? /');
    await panel(page).getByRole('textbox', { name: 'Sheet name' }).fill('Summary');
    await panel(page).getByRole('textbox', { name: 'File name' }).fill('');
    await expect(panel(page).getByRole('alert')).toContainText('The file name is empty');
  });

  test('a csv file has no sheet name', async ({ page }) => {
    await inputThen(page, 'Output', DATA);
    await chooseOption(page, /^File type/, /csv file/);
    await expect(panel(page).getByRole('textbox', { name: 'Sheet name' })).toHaveCount(0);
    await chooseOption(page, /^File type/, /Excel workbook/);
    await expect(panel(page).getByRole('textbox', { name: 'Sheet name' })).toBeVisible();
  });

  test('sorting by a column: descending, blanks last (a real preview of what the step writes)', async ({ page }) => {
    await inputThen(page, 'Output', DATA);
    await panel(page).getByRole('button', { name: 'Add sort key' }).click();
    await panel(page).getByRole('textbox', { name: 'Sort column 1' }).fill('age');
    await chooseOption(page, /^Direction 1/, 'Descending');
    await preview(page);
    await expect(previewRows(page)).toHaveCount(3, { timeout: 30_000 });
    await expect(cell(page, 0, 0)).toHaveText('Bob');
    await expect(cell(page, 1, 0)).toHaveText('Ann');
    await expect(cell(page, 2, 0)).toHaveText('Cy');
  });

  test('sorting by a formula; rows that tie keep their order', async ({ page }) => {
    await inputThen(page, 'Output', DATA);
    await panel(page).getByRole('button', { name: 'Add sort key' }).click();
    await chooseOption(page, /^Sort key type 1/, 'Formula');
    await panel(page).getByRole('textbox', { name: 'Sort formula 1' }).fill('LEN([name])');
    await preview(page);
    await expect(previewRows(page)).toHaveCount(3, { timeout: 30_000 });
    await expect(cell(page, 0, 0)).toHaveText('Cy');
    await expect(cell(page, 1, 0)).toHaveText('Bob');
    await expect(cell(page, 2, 0)).toHaveText('Ann');
  });

  test('"Write all columns" off: only the listed columns are written', async ({ page }) => {
    await inputThen(page, 'Output', DATA);
    await panel(page).getByRole('checkbox', { name: 'Write all columns' }).click();
    await expect(panel(page).getByRole('status').filter({ hasText: 'Add at least one column to write' })).toBeVisible();
    await group(page, 'Columns to write, in this order').getByRole('textbox', { name: 'Column name' }).fill('name');
    await group(page, 'Columns to write, in this order').getByRole('button', { name: 'Add', exact: true }).click();
    await preview(page);
    await expect(previewRows(page)).toHaveCount(3, { timeout: 30_000 });
    await expect(panel(page).getByRole('columnheader')).toHaveText(['name']);
  });

  test('two Output steps with the same file and sheet clash: the message names the sheet and what to do', async ({ page }) => {
    await newFlow(page);
    await addStep(page, 'Output');
    await addStep(page, 'Output');
    await panel(page).getByRole('tab', { name: 'Configure' }).click();
    await expect(panel(page).getByRole('textbox', { name: 'Sheet name' })).toHaveValue('Sheet2');
    await panel(page).getByRole('textbox', { name: 'Sheet name' }).fill('sheet1');
    await expect(panel(page).getByRole('alert')).toContainText('same name as the sheet "Sheet1"');
    await expect(panel(page).getByRole('alert')).toContainText('Choose another sheet name');
    await panel(page).getByRole('textbox', { name: 'Sheet name' }).fill('Totals');
    await expect(panel(page).getByRole('alert')).toHaveCount(0);
  });

  test('an Output step with no input says so in the Test tab', async ({ page }) => {
    await newFlow(page);
    await addStep(page, 'Output');
    await panel(page).getByRole('tab', { name: 'Test' }).click();
    await expect(panel(page).getByRole('alert')).toContainText('This step has no input yet');
  });
});

test.describe('Append', () => {
  async function appendTwo(page: Page, a: string, b: string) {
    await newFlow(page);
    await addStep(page, 'Input file');
    await addStep(page, 'Input file');
    await addStep(page, 'Append');
    await panel(page).getByRole('button', { name: /^Input from, input 1/ }).press('ArrowDown');
    await page.getByRole('option', { name: /1\. Input file$/ }).click();
    await panel(page).getByRole('button', { name: /^Input from, input 2/ }).press('ArrowDown');
    await page.getByRole('option', { name: /2\. Input file 2/ }).click();
    await panel(page).getByRole('tab', { name: 'Test' }).click();
    await panel(page).locator('input[type=file]').nth(0).setInputFiles(csv(a));
    await panel(page).locator('input[type=file]').nth(1).setInputFiles(csv(b));
    await panel(page).getByRole('tab', { name: 'Configure' }).click();
  }

  test('by name (the default) stacks the inputs and leaves blanks for missing columns', async ({ page }) => {
    await appendTwo(page, 'a,b\n1,2\n', 'b,c\n3,4\n');
    await expect(panel(page).getByRole('button', { name: /^Match columns: By name/ })).toBeVisible();
    await preview(page);
    await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
    await expect(panel(page).getByRole('columnheader')).toHaveText(['a', 'b', 'c']);
    await expect(cell(page, 0, 2)).toHaveText('');
    await expect(cell(page, 1, 0)).toHaveText('');
  });

  test('by position stacks columns in order, whatever their names', async ({ page }) => {
    await appendTwo(page, 'a,b\n1,2\n', 'p,q\n5,6\n');
    await chooseOption(page, /^Match columns/, /^By position/);
    await preview(page);
    await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
    await expect(panel(page).getByRole('columnheader')).toHaveText(['a', 'b']);
    await expect(cell(page, 1, 0)).toHaveText('5');
  });
});

test.describe('SQL', () => {
  const DATA = 'dept,hours\nA,2\nA,3\nB,5\n';
  const query = (page: Page) => panel(page).getByRole('textbox', { name: 'SQL query' });

  test('runs a query over in1 (a real preview)', async ({ page }) => {
    await inputThen(page, 'SQL', DATA);
    await expect(panel(page)).toContainText('The query is empty');
    await query(page).fill('SELECT dept, sum(hours) AS total FROM in1 GROUP BY dept ORDER BY dept');
    await expect(panel(page).getByRole('status').filter({ hasText: 'The query is allowed' })).toBeVisible();
    await preview(page);
    await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
    await expect(panel(page).getByRole('columnheader')).toHaveText(['dept', 'total']);
    await expect(cell(page, 0, 1)).toHaveText('5');
  });

  test('a query that writes is refused as you type, with the reason', async ({ page }) => {
    await inputThen(page, 'SQL', DATA);
    await query(page).fill('DROP TABLE in1');
    await expect(panel(page).getByRole('alert')).toBeVisible();
    await expect(panel(page).getByRole('alert')).not.toContainText('The query is allowed');
  });

  test('a mistake in the query shows the engine message in the preview', async ({ page }) => {
    await inputThen(page, 'SQL', DATA);
    await query(page).fill('SELECT nope FROM in1');
    await preview(page);
    await expect(panel(page).getByRole('alert')).toContainText('the SQL has an error', { timeout: 30_000 });
  });
});
