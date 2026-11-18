import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FUNCTION_DOCS } from '../src/ui/builder/forms/function-docs';
import { seedSnapshot } from '../src/store/seed';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const DATA = 'name,age,city\nAnn,31,Hue\nBob,42,Hanoi\n';
const csv = (text: string) => ({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const formula = (page: Page) => panel(page).getByRole('textbox', { name: 'Formula' });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');

/** Input file -> <step> (selected), a test file chosen, Configure tab open. */
async function setup(page: Page, step: 'Formula column' | 'Filter') {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Formula test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, step);
  await panel(page).getByRole('button', { name: /^Input from/ }).press('ArrowDown');
  await page.getByRole('option', { name: /1\. Input file/ }).click();
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').setInputFiles(csv(DATA));
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
}
const loadColumns = async (page: Page) => {
  await panel(page).getByRole('button', { name: 'Load columns from test file' }).click();
  await expect(panel(page).getByRole('button', { name: /^Insert a column/ })).toBeVisible({ timeout: 30_000 });
};

test('the form has the column name and the formula; without columns it checks only the writing', async ({ page }) => {
  await setup(page, 'Formula column');
  await expect(panel(page).getByRole('textbox', { name: 'New column name' })).toHaveValue('New column');
  await expect(panel(page)).toContainText('The formula is empty');
  await formula(page).fill('[age] * 2');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Load the columns to check' })).toBeVisible();
  await formula(page).fill('[age] *');
  await expect(panel(page).getByRole('alert')).toContainText(/Character \d+:/);
});

test('with the columns loaded the message gives the result type; an unknown column is an error with its position', async ({ page }) => {
  await setup(page, 'Formula column');
  await formula(page).fill('[age] * 2');
  await loadColumns(page);
  await expect(panel(page).getByRole('status').filter({ hasText: 'Formula is valid. Result type: number.' })).toBeVisible();
  await formula(page).fill('[agee] * 2');
  await expect(panel(page).getByRole('alert')).toContainText(/Character 1:.*agee/);
  await formula(page).fill('[name] & "!"');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Result type: text.' })).toBeVisible();
  await formula(page).fill('[name] * 2');
  await expect(panel(page).getByRole('alert')).toBeVisible();
});

test('a function button inserts NAME() with the cursor inside the brackets', async ({ page }) => {
  await setup(page, 'Formula column');
  await panel(page).getByRole('button', { name: 'Insert IF', exact: true }).click();
  await expect(formula(page)).toHaveValue('IF()');
  await page.keyboard.type('TRUE, 1, 2');
  await expect(formula(page)).toHaveValue('IF(TRUE, 1, 2)');
  // A function goes in where the cursor is: after the last character here.
  await formula(page).press('End');
  await panel(page).getByRole('button', { name: 'Insert EFFECTIVE_DATE' }).click();
  await expect(formula(page)).toHaveValue('IF(TRUE, 1, 2)EFFECTIVE_DATE()');
});

test('All functions opens a searchable list; choosing one inserts it and closes the list', async ({ page }) => {
  await setup(page, 'Formula column');
  await panel(page).getByRole('button', { name: 'All functions' }).click();
  const dialog = page.getByRole('dialog', { name: 'All functions' });
  await dialog.getByRole('textbox', { name: 'Search functions' }).fill('round');
  await expect(dialog.getByRole('button', { name: /^Insert ROUND/ })).toHaveCount(3);
  await dialog.getByRole('textbox', { name: 'Search functions' }).fill('zzz');
  await expect(dialog).toContainText('No function matches');
  await dialog.getByRole('textbox', { name: 'Search functions' }).fill('weekday');
  await dialog.getByRole('button', { name: 'Insert WEEKDAY' }).click();
  await expect(dialog).toBeHidden();
  await expect(formula(page)).toHaveValue('WEEKDAY()');
});

test('the list holds every function of Tier 1 and EFFECTIVE_DATE, grouped', async ({ page }) => {
  await setup(page, 'Formula column');
  await panel(page).getByRole('button', { name: 'All functions' }).click();
  const dialog = page.getByRole('dialog', { name: 'All functions' });
  await expect(dialog.getByRole('button', { name: /^Insert / })).toHaveCount(FUNCTION_DOCS.length);
  expect(FUNCTION_DOCS.length).toBe(50);
  for (const g of ['Logic', 'Math', 'Text', 'Date']) await expect(dialog.getByText(g, { exact: true })).toBeVisible();
});

test('Insert a column puts the column in square brackets at the cursor', async ({ page }) => {
  await setup(page, 'Formula column');
  await loadColumns(page);
  await formula(page).fill('1 + ');
  await panel(page).getByRole('button', { name: /^Insert a column/ }).click();
  await page.getByRole('option', { name: 'age' }).click();
  await expect(formula(page)).toHaveValue('1 + [age]');
});

test('the formula adds a column to a real preview', async ({ page }) => {
  await setup(page, 'Formula column');
  await panel(page).getByRole('textbox', { name: 'New column name' }).fill('double_age');
  await formula(page).fill('[age] * 2');
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['name', 'age', 'city', 'double_age']);
  await expect(previewRows(page).first()).toContainText('62');
  await expect(previewRows(page).nth(1)).toContainText('84');
});

test('an empty column name shows what to do', async ({ page }) => {
  await setup(page, 'Formula column');
  await panel(page).getByRole('textbox', { name: 'New column name' }).fill('');
  await expect(panel(page).getByRole('alert').filter({ hasText: 'The column has no name' })).toContainText('Type a name.');
});

test('a Filter condition must give true or false: the message says so once the columns are loaded', async ({ page }) => {
  await setup(page, 'Filter');
  await panel(page).getByRole('textbox', { name: 'Condition' }).fill('[age] + 1');
  await loadColumns(page);
  await expect(panel(page).getByRole('alert')).toContainText('gives a number, but this step needs true or false');
  await panel(page).getByRole('textbox', { name: 'Condition' }).fill('[age] > 35');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Result type: boolean.' })).toBeVisible();
});

test('the formula controls are disabled for a published version', async ({ page }) => {
  const seed = seedSnapshot();
  const published = seed.flows[0]!.versions.find((v) => v.versionNo === 3)!;
  (published.definition as { nodes: unknown[] }).nodes.push({ id: 'formula-1', type: 'formula_column', label: 'Formula column', position: { x: 300, y: 0 }, settings: { name: 'x', expression: '1' } });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(seed));
  await page.goto('/flows/flow-timesheet/versions/3');
  await page.locator('.react-flow__node').filter({ hasText: 'Formula column' }).first().click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await expect(formula(page)).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: 'Insert IF', exact: true })).toBeDisabled();
});
