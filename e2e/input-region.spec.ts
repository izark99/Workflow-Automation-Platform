import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { REF_FLOW, seedReferenceStep } from './reference-step-flow';

// T6.15b: the region settings of the Input step on the Configure tab.
const node = (id: string, type: string, label: string, y: number, s: Record<string, unknown>) => ({ id, type, label, position: { x: 0, y }, settings: s });
const settings = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const card = (page: Page, title: string) => page.locator('.react-flow__node').filter({ has: page.getByText(title, { exact: true }) });
const field = (page: Page, name: string) => settings(page).getByRole('textbox', { name, exact: true });
const csv = (text: string) => ({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });

async function open(page: Page, inputSettings: Record<string, unknown> = { key: 'people', headerRow: 1 }, extra = {}) {
  await seedReferenceStep(page, { nodes: [node('in', 'input_file', 'People', 0, inputSettings), node('out', 'output', 'Out', 160, { file: 'R', format: 'xlsx', sheet: 'S' })], ...extra });
  await page.goto(REF_FLOW);
  await card(page, 'People').click();
  await settings(page).getByRole('tab', { name: 'Configure' }).click();
}
/** Selects the other step and comes back: the form is read again from the saved settings. */
async function reselect(page: Page) {
  await card(page, 'Out').click();
  await card(page, 'People').click();
}

test('the form starts with the defaults: no first or last column, and reading to the end of the sheet', async ({ page }) => {
  await open(page);
  await expect(field(page, 'First column of the table')).toHaveValue('');
  await expect(field(page, 'Last column of the table')).toHaveValue('');
  await expect(settings(page).getByRole('button', { name: /^Stop reading at: The end of the sheet/ })).toBeVisible();
  await expect(settings(page).getByRole('group', { name: 'Rows to ignore' })).toBeVisible();
  await expect(settings(page).getByRole('group', { name: 'Columns the file must have' })).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
});

test('the first and last column are saved as a letter in capitals or as a number, and read back', async ({ page }) => {
  await open(page);
  await field(page, 'First column of the table').fill('c');
  await field(page, 'Last column of the table').fill('6');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await reselect(page);
  await expect(field(page, 'First column of the table')).toHaveValue('C');
  await expect(field(page, 'Last column of the table')).toHaveValue('6');
});

test('a column that is not one, and a last column before the first, say what to do and are not saved', async ({ page }) => {
  await open(page);
  await field(page, 'First column of the table').fill('A1');
  await expect(settings(page).getByText('"A1" is not a column. Type a letter such as C, or a number such as 3.')).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await field(page, 'First column of the table').fill('D');
  await field(page, 'Last column of the table').fill('B');
  await expect(settings(page).getByText(/The last column B is before the first column D\./)).toBeVisible();
});

test('"Stop reading at" shows the fields of the chosen way, each with its own check', async ({ page }) => {
  await open(page);
  const stop = () => settings(page).getByRole('button', { name: /^Stop reading at:/ });
  await stop().click();
  await page.getByRole('option', { name: 'The first empty row' }).click();
  await expect(field(page, 'Empty rows in a row')).toHaveValue('1');
  await field(page, 'Empty rows in a row').fill('11');
  await expect(settings(page).getByText(/not a count of empty rows\. Type a whole number from 1 to 10/)).toBeVisible();
  await field(page, 'Empty rows in a row').fill('2');
  await stop().click();
  await page.getByRole('option', { name: 'A row that has a text' }).click();
  await expect(settings(page).getByText(/The text of the row is empty/)).toBeVisible();
  await field(page, 'Text of the row').fill('Prepared by');
  await settings(page).getByRole('button', { name: /^The row:/ }).click();
  await page.getByRole('option', { name: 'Starts with the text' }).click();
  await field(page, 'Column to look in (empty: any column)').fill('Label');
  await stop().click();
  await page.getByRole('option', { name: 'A fixed row' }).click();
  await field(page, 'Last row to read').fill('x');
  await expect(settings(page).getByText(/"x" is not a row number/)).toBeVisible();
  await field(page, 'Last row to read').fill('40');
  // Back to the marker: what was typed is read back from the saved settings after a reselect, for the way that is saved (the row).
  await reselect(page);
  await expect(settings(page).getByRole('button', { name: /^Stop reading at: A fixed row/ })).toBeVisible();
  await expect(field(page, 'Last row to read')).toHaveValue('40');
});

test('a marker row is saved with its text, how it matches and its column', async ({ page }) => {
  await open(page);
  await settings(page).getByRole('button', { name: /^Stop reading at:/ }).click();
  await page.getByRole('option', { name: 'A row that has a text' }).click();
  await field(page, 'Text of the row').fill('Prepared by');
  await settings(page).getByRole('button', { name: /^The row:/ }).click();
  await page.getByRole('option', { name: 'Starts with the text' }).click();
  await field(page, 'Column to look in (empty: any column)').fill('Label');
  await reselect(page);
  await expect(field(page, 'Text of the row')).toHaveValue('Prepared by');
  await expect(settings(page).getByRole('button', { name: /^The row: Starts with the text/ })).toBeVisible();
  await expect(field(page, 'Column to look in (empty: any column)')).toHaveValue('Label');
});

test('rows to ignore are added, need both a column and a text, and are removed', async ({ page }) => {
  await open(page);
  const group = settings(page).getByRole('group', { name: 'Rows to ignore' });
  await group.getByRole('button', { name: 'Add a row to ignore' }).click();
  await expect(group.getByText('Row 1 of the rows to ignore needs a column and a text. Fill both, or remove it.')).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await group.getByRole('textbox', { name: 'Column 1', exact: true }).fill('Label');
  await group.getByRole('textbox', { name: 'Text in that column 1' }).fill('Subtotal');
  await expect(group.getByRole('alert')).toHaveCount(0);
  await reselect(page);
  await expect(settings(page).getByRole('group', { name: 'Rows to ignore' }).getByRole('textbox', { name: 'Column 1', exact: true })).toHaveValue('Label');
  await settings(page).getByRole('button', { name: 'Remove row to ignore 1' }).click();
  await expect(settings(page).getByRole('textbox', { name: 'Column 1', exact: true })).toHaveCount(0);
});

test('the columns the file must have are typed, or loaded from the test file and picked, and removed', async ({ page }) => {
  await open(page);
  const group = settings(page).getByRole('group', { name: 'Columns the file must have' });
  await group.getByRole('textbox', { name: 'Column name' }).fill('Code');
  await group.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(group.getByText('Code', { exact: true })).toBeVisible();
  // Without a test file, loading says what to do.
  await settings(page).getByRole('button', { name: 'Load columns from the test file' }).click();
  await expect(settings(page).getByRole('alert')).toBeVisible();
  // With one chosen on the Test tab, it loads and the list offers the columns of the file.
  await settings(page).getByRole('tab', { name: 'Test' }).click();
  await settings(page).locator('input[type=file]').setInputFiles(csv('Code,Label,Amount\nK1,Item,5\n'));
  await settings(page).getByRole('tab', { name: 'Configure' }).click();
  await settings(page).getByRole('button', { name: 'Load columns from the test file' }).click();
  await expect(settings(page).getByRole('button', { name: 'Reload columns' })).toBeVisible({ timeout: 30_000 });
  await settings(page).getByRole('button', { name: /^Add to Columns the file must have/ }).click();
  await page.getByRole('option', { name: 'Amount', exact: true }).click();
  await expect(group.getByText('Amount', { exact: true })).toBeVisible();
  await settings(page).getByRole('button', { name: 'Remove Code from Columns the file must have' }).click();
  await expect(group.getByText('Code', { exact: true })).toHaveCount(0);
});

test('the first and last column take a parameter, and the other region settings have no parameter button', async ({ page }) => {
  await open(page, { key: 'people', headerRow: 1 }, { parameters: [{ key: 'start', label: 'Start column', type: 'text', required: true }] });
  await expect(settings(page).getByRole('button', { name: 'Use a parameter for First column of the table' })).toBeEnabled();
  await expect(settings(page).getByRole('button', { name: 'Use a parameter for Last column of the table' })).toBeEnabled();
  await expect(settings(page).getByRole('button', { name: /^Use a parameter for (Stop reading|Rows to ignore|Columns the file)/ })).toHaveCount(0);
  const first = settings(page).getByRole('button', { name: 'Use a parameter for First column of the table' });
  await first.click();
  await page.getByRole('option', { name: /Start column/ }).click();
  await expect(settings(page).getByText('Start column', { exact: true })).toBeVisible();
  // The form still works with the first column bound: the last column keeps being edited.
  await field(page, 'Last column of the table').fill('F');
  await expect(settings(page).getByText('Start column', { exact: true })).toBeVisible();
});

test('a published (read-only) version shows the region settings and cannot change them', async ({ page }) => {
  await open(page, { key: 'people', headerRow: 1, firstColumn: 'B', stopAt: { kind: 'row', row: 9 } }, { status: 'published' });
  await expect(field(page, 'First column of the table')).toBeDisabled();
  await expect(settings(page).getByRole('button', { name: /^Stop reading at: A fixed row/ })).toBeDisabled();
  await expect(settings(page).getByRole('button', { name: 'Add a row to ignore' })).toBeDisabled();
});
