import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string) => ({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const DATA = 'name,age,city\nAnn,31,Hue\nBob,42,Hanoi\n';
const list = (page: Page) => panel(page).getByRole('list', { name: 'Column mapping rows' });
const rowOf = (page: Page, source: string) => list(page).getByRole('listitem', { name: `Source column: ${source}` });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');

/** Input file -> Column mapping (selected), on the Configure tab. */
async function setup(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Mapping test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, 'Column mapping');
  await panel(page).getByRole('button', { name: /^Input from/ }).press('ArrowDown');
  await page.getByRole('option', { name: /1\. Input file/ }).click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
}
async function chooseFile(page: Page, text = DATA) {
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').setInputFiles(csv(text));
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
}
async function previewNow(page: Page) {
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
}
async function pasteIntoGrid(page: Page, text: string) {
  await page.evaluate((t) => {
    const target = document.querySelector('ul[aria-label="Column mapping rows"]')!;
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

test('loading the columns needs a test file; with one, every column of the table becomes a row', async ({ page }) => {
  await setup(page);
  await expect(panel(page)).toContainText('No columns listed yet');
  await panel(page).getByRole('button', { name: 'Load columns from test file' }).click();
  await expect(panel(page).getByRole('alert')).toContainText('Choose a test file on the Test tab first');
  await chooseFile(page);
  await panel(page).getByRole('button', { name: 'Load columns from test file' }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Added 3 columns' })).toBeVisible({ timeout: 30_000 });
  for (const c of ['name', 'age', 'city']) await expect(rowOf(page, c)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Load columns from test file' }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'already listed' })).toBeVisible({ timeout: 30_000 });
});

test('keep, new name and type change what the preview shows', async ({ page }) => {
  await setup(page);
  await chooseFile(page);
  await panel(page).getByRole('button', { name: 'Load columns from test file' }).click();
  await expect(rowOf(page, 'city')).toBeVisible({ timeout: 30_000 });
  await rowOf(page, 'city').getByRole('checkbox').click();
  await expect(rowOf(page, 'city').getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
  await rowOf(page, 'age').getByRole('textbox', { name: 'New name' }).fill('years');
  await rowOf(page, 'age').getByRole('button', { name: /^Type of age/ }).click();
  await page.getByRole('option', { name: 'text', exact: true }).click();
  await previewNow(page);
  await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['name', 'years']);
  const align = await previewRows(page).first().locator('td').nth(1).evaluate((el) => getComputedStyle(el).textAlign);
  expect(align).toBe('left'); // the age column is text now
});

test('columns that are not listed stay as they are', async ({ page }) => {
  await setup(page);
  await chooseFile(page);
  await panel(page).getByRole('button', { name: 'Add column' }).click();
  await rowOf(page, '(empty)').getByRole('textbox', { name: 'Source column' }).fill('name');
  await rowOf(page, 'name').getByRole('textbox', { name: 'New name' }).fill('Full name');
  await previewNow(page);
  await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['Full name', 'age', 'city']);
});

test('Paste from Excel opens a dialog; the pasted rows replace the list and drive the preview', async ({ page }) => {
  await setup(page);
  await chooseFile(page);
  await panel(page).getByRole('button', { name: 'Paste from Excel' }).click();
  const dialog = page.getByRole('dialog', { name: 'Paste from Excel' });
  await dialog.getByRole('textbox', { name: 'Pasted cells' }).fill('Column\tNew name\tType\tKeep\nname\tFull name\ttext\tyes\nage\t\tnumber\tno');
  await dialog.getByRole('button', { name: 'Use these rows' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Pasted 2 rows.' })).toBeVisible();
  await expect(rowOf(page, 'name').getByRole('textbox', { name: 'New name' })).toHaveValue('Full name');
  await expect(rowOf(page, 'age').getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
  await previewNow(page);
  await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['Full name', 'city']);
});

test('a paste straight onto the grid (as from Excel) is accepted too; a single value is left to its own field', async ({ page }) => {
  await setup(page);
  await panel(page).getByRole('button', { name: 'Add column' }).click();
  await pasteIntoGrid(page, 'a\tA\nb\tB\n');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Pasted 2 rows.' })).toBeVisible();
  await expect(rowOf(page, 'a')).toBeVisible();
  await expect(rowOf(page, 'b').getByRole('textbox', { name: 'New name' })).toHaveValue('B');
  await pasteIntoGrid(page, 'just one value');
  await expect(rowOf(page, 'a')).toBeVisible(); // not treated as a grid: rows unchanged
});

test('a bad paste is refused with the row and what to do, and the list stays as it was', async ({ page }) => {
  await setup(page);
  await panel(page).getByRole('button', { name: 'Paste from Excel' }).click();
  const dialog = page.getByRole('dialog', { name: 'Paste from Excel' });
  await dialog.getByRole('textbox', { name: 'Pasted cells' }).fill('a\t\tnumber\nb\t\tdecimal');
  await dialog.getByRole('button', { name: 'Use these rows' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Row 2 of the pasted text: "decimal" is not a type');
  await page.keyboard.press('Escape');
  await expect(list(page).getByRole('listitem')).toHaveCount(0);
});

test('a source column listed twice shows what to do and saves nothing; a row can be removed', async ({ page }) => {
  await setup(page);
  await panel(page).getByRole('button', { name: 'Add column' }).click();
  await panel(page).getByRole('button', { name: 'Add column' }).click();
  const fields = list(page).getByRole('textbox', { name: 'Source column' });
  await fields.nth(0).fill('x');
  await fields.nth(1).fill('x');
  await expect(panel(page).getByRole('alert')).toContainText('"x" is listed more than once. Remove one of the rows.');
  await panel(page).getByRole('button', { name: 'Remove x' }).first().click();
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
  await expect(list(page).getByRole('listitem')).toHaveCount(1);
});

test('the controls are disabled for a published version', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/3');
  await page.locator('.react-flow__node').filter({ hasText: 'Column mapping' }).first().click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await expect(panel(page).getByRole('button', { name: 'Paste from Excel' })).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: 'Add column' })).toBeDisabled();
});
