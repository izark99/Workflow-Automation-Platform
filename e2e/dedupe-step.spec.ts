import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// T8.10: Remove duplicates (SPEC 15.4 item 2): two outputs, kept and removed, on the Test tab.
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string) => ({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');
const group = (page: Page, name: string) => panel(page).getByRole('group', { name });
const DATA = 'id,name,hours\n1,Lan,5\n2,An,5\n3,Lan,5\n4,,\n5,An,7\n6,,\n7,Lan,5\n';

async function dedupeStep(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Dedupe test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, 'Remove duplicates');
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').first().setInputFiles(csv(DATA));
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
}
const columnsThatDecide = async (page: Page, names: string[]) => {
  await panel(page).getByRole('checkbox', { name: 'Compare all columns' }).click();
  for (const n of names) {
    await group(page, 'Columns that decide').getByRole('textbox', { name: 'Column name' }).fill(n);
    await group(page, 'Columns that decide').getByRole('button', { name: 'Add', exact: true }).click();
  }
};
const ids = async (page: Page) => {
  const n = await previewRows(page).count();
  return Promise.all(Array.from({ length: n }, (_, i) => previewRows(page).nth(i).locator('td').first().textContent()));
};

test('the card has two handles with their names, and the step is connected after the Input file', async ({ page }) => {
  await dedupeStep(page);
  const card = page.locator('.react-flow__node').filter({ hasText: 'Remove duplicates' });
  await expect(card.locator('.react-flow__handle.source')).toHaveCount(2);
  await expect(card).toContainText('kept');
  await expect(card).toContainText('removed');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});

test('the Test tab offers both outputs with their row counts: kept and removed add up to the file', async ({ page }) => {
  await dedupeStep(page);
  await columnsThatDecide(page, ['name', 'hours']);
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  const chips = group(page, 'Output of the step');
  await expect(chips.getByRole('button', { name: 'Kept', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(4, { timeout: 30_000 });
  expect(await ids(page)).toEqual(['1', '2', '4', '5']);
  await expect(chips.getByRole('button', { name: 'Kept (4)' })).toBeVisible();
  await expect(chips.getByRole('button', { name: 'Removed (3)' })).toBeVisible();
  await chips.getByRole('button', { name: 'Removed (3)' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(3, { timeout: 30_000 });
  expect(await ids(page)).toEqual(['3', '6', '7']);
});

test('keep the last row: the last of equal rows stays, and kept follows the input order', async ({ page }) => {
  await dedupeStep(page);
  await columnsThatDecide(page, ['name', 'hours']);
  await panel(page).getByRole('button', { name: /^Keep/ }).click();
  await page.getByRole('option', { name: 'Keep the last row' }).click();
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(4, { timeout: 30_000 });
  expect(await ids(page)).toEqual(['2', '5', '6', '7']);
});

test('with all columns compared nothing in this file repeats, and with no column chosen the step says so', async ({ page }) => {
  await dedupeStep(page);
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(7, { timeout: 30_000 });
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await panel(page).getByRole('checkbox', { name: 'Compare all columns' }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'No column is chosen yet' })).toBeVisible();
});
