import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { REF_FLOW, seedReferenceStep } from './reference-step-flow';

// T6.12a: the parameter control in the Input and Output forms.
const PARAMS = [
  { key: 'period', label: 'Period', type: 'text', required: true },
  { key: 'header', label: 'Header row number', type: 'number', required: false },
  { key: 'kind', label: 'File kind', type: 'list', required: false, options: ['xlsx', 'csv'] },
];
const node = (id: string, type: string, label: string, settings: Record<string, unknown>) => ({ id, type, label, position: { x: 0, y: 0 }, settings });
const settings = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const configure = async (page: Page) => {
  await page.goto(REF_FLOW);
  await page.locator('.react-flow__node').first().click();
  await settings(page).getByRole('tab', { name: 'Configure' }).click();
};
const useButton = (page: Page, field: string) => settings(page).getByRole('button', { name: `Use a parameter for ${field}` });
const listFor = (page: Page, button: ReturnType<typeof useButton>) => button.getAttribute('aria-controls').then((id) => page.locator(`[id="${id}"]`));
const seedInput = (page: Page, s: Record<string, unknown> = { key: 'people', headerRow: 1 }, extra: Record<string, unknown> = {}) =>
  seedReferenceStep(page, { parameters: PARAMS, nodes: [node('in', 'input_file', 'People', s)], ...extra });

test('a setting is bound: the list shows only the parameters of a fitting type, the field becomes a chip, and Save keeps it', async ({ page }) => {
  await seedInput(page);
  await configure(page);
  // The sheet takes a text (or a list) parameter, the header row a number.
  const sheet = useButton(page, 'Sheet name');
  await sheet.click();
  const sheetList = await listFor(page, sheet);
  await expect(sheetList.getByRole('option')).toHaveCount(2);
  await expect(sheetList.getByRole('option', { name: /Period/ })).toContainText('period');
  await expect(sheetList.getByRole('option', { name: /File kind/ })).toContainText('kind');
  await expect(sheetList.getByRole('option', { name: /Header row number/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const header = useButton(page, 'Header row');
  await header.click();
  const headerList = await listFor(page, header);
  await expect(headerList.getByRole('option')).toHaveCount(1);
  await expect(headerList.getByRole('option')).toContainText('Header row number');
  await headerList.getByRole('option').click();
  // The header row is a chip now, with no input; the sheet is still a field.
  await expect(settings(page).getByRole('textbox', { name: 'Header row' })).toHaveCount(0);
  await expect(settings(page).getByText('Parameter:')).toBeVisible();
  await expect(settings(page).getByText('Header row number', { exact: true })).toBeVisible();
  await expect(settings(page).getByRole('textbox', { name: 'Sheet name' })).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  // Save, leave the builder and come back: the binding is saved.
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await page.getByRole('link', { name: 'Flows', exact: true }).click();
  await page.getByRole('link', { name: /Reference step flow/ }).click();
  await page.locator('.react-flow__node').first().click();
  await settings(page).getByRole('tab', { name: 'Configure' }).click();
  await expect(settings(page).getByText('Header row number', { exact: true })).toBeVisible();
});

test('"Use a fixed value" gives the field back with the value it had', async ({ page }) => {
  await seedInput(page, { key: 'people', sheet: 'July', headerRow: 1 });
  await configure(page);
  const sheet = useButton(page, 'Sheet name');
  await sheet.click();
  await (await listFor(page, sheet)).getByRole('option', { name: /Period/ }).click();
  await expect(settings(page).getByRole('textbox', { name: 'Sheet name' })).toHaveCount(0);
  await settings(page).getByRole('button', { name: 'Use a fixed value' }).click();
  await expect(settings(page).getByRole('textbox', { name: 'Sheet name' })).toHaveValue('July');
});

test('editing another field of the form keeps the binding', async ({ page }) => {
  await seedInput(page, { key: 'people', sheet: { $param: 'period' }, headerRow: 1 });
  await configure(page);
  await expect(settings(page).getByRole('textbox', { name: 'Sheet name' })).toHaveCount(0);
  await settings(page).getByRole('textbox', { name: 'Rows to skip after the header' }).fill('2');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(settings(page).getByText('Period', { exact: true })).toBeVisible();
  await expect(settings(page).getByRole('textbox', { name: 'Sheet name' })).toHaveCount(0);
});

test('a parameter that was deleted leaves the field with the chip in the error state and says what to do', async ({ page }) => {
  await seedInput(page, { key: 'people', sheet: { $param: 'gone' }, headerRow: 1 });
  await configure(page);
  await expect(settings(page).getByText('Parameter gone no longer exists')).toBeVisible();
  await expect(settings(page).getByRole('alert')).toContainText('Choose another parameter, or use a fixed value.');
  await settings(page).getByRole('button', { name: 'Use a fixed value' }).click();
  await expect(settings(page).getByRole('textbox', { name: 'Sheet name' })).toBeVisible();
});

test('a flow with no parameter of the type has the button off, and a read-only version cannot bind or give back', async ({ page }) => {
  await seedReferenceStep(page, { parameters: [PARAMS[0]], nodes: [node('in', 'input_file', 'People', { key: 'people', headerRow: 1 })] });
  await configure(page);
  await expect(useButton(page, 'Header row')).toBeDisabled();
  await expect(useButton(page, 'Sheet name')).toBeEnabled();
});

test('a published (read-only) version shows the buttons off', async ({ page }) => {
  await seedInput(page, { key: 'people', sheet: { $param: 'period' }, headerRow: 1 }, { status: 'published' });
  await configure(page);
  await expect(settings(page).getByRole('button', { name: 'Use a fixed value' })).toBeDisabled();
  await expect(useButton(page, 'Header row')).toBeDisabled();
});

test('the Output form binds the file, the format and the sheet; the sheet stays when the format is bound', async ({ page }) => {
  await seedReferenceStep(page, { parameters: PARAMS, nodes: [node('out', 'output', 'Out', { file: 'Result', format: 'xlsx', sheet: 'Sheet1' })] });
  await configure(page);
  const format = useButton(page, 'File type');
  await format.click();
  // A choice setting takes a list or a text parameter.
  await expect((await listFor(page, format)).getByRole('option')).toHaveCount(2);
  await (await listFor(page, format)).getByRole('option', { name: /File kind/ }).click();
  await expect(settings(page).getByText('File kind', { exact: true })).toBeVisible();
  // The sheet is still offered, and takes a parameter too; no message about the sheet appears.
  const sheet = useButton(page, 'Sheet name');
  await sheet.click();
  await (await listFor(page, sheet)).getByRole('option', { name: /Period/ }).click();
  await expect(settings(page).getByText('Period', { exact: true })).toBeVisible();
  const file = useButton(page, 'File name');
  await file.click();
  await (await listFor(page, file)).getByRole('option', { name: /Period/ }).click();
  await expect(settings(page).getByText('Parameter:')).toHaveCount(3);
  await expect(settings(page).getByRole('alert')).toHaveCount(0);
});
