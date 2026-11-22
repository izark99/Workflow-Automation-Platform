import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string, name = 'people.csv') => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

/** Input file -> Column mapping, with the Column mapping step selected and its Test tab open. */
async function inputThenMapping(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Preview test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, 'Column mapping');
  await panel(page).getByRole('button', { name: /^Input from: None/ }).press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await panel(page).getByRole('tab', { name: 'Test' }).click();
}
const chooseFile = (page: Page, file: ReturnType<typeof csv>) => panel(page).locator('input[type=file]').setInputFiles(file);
const rows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');

test('the preview needs a test file first: the button is disabled and an empty state says what to do', async ({ page }) => {
  await inputThenMapping(page);
  await expect(panel(page).getByRole('button', { name: 'Preview first rows' })).toBeDisabled();
  await expect(panel(page)).toContainText('Choose a test file for each Input file step');
  await expect(panel(page)).toContainText('Input file: No file chosen');
});

test('with a test file the step shows its first rows as a table; numbers are right-aligned', async ({ page }) => {
  await inputThenMapping(page);
  await chooseFile(page, csv('name,age\nAnn,31\nBob,42\n'));
  await expect(panel(page)).toContainText('Input file: people.csv');
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(rows(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['name', 'age']);
  await expect(rows(page).first()).toContainText('Ann');
  await expect(panel(page).getByText('2 rows.')).toBeVisible();
  const align = await rows(page).first().locator('td').nth(1).evaluate((el) => getComputedStyle(el).textAlign);
  expect(align).toBe('right');
  expect(Math.round((await rows(page).first().boundingBox())!.height)).toBe(45);
});

test('more than 100 rows: the table holds 100 and the text gives the full count', async ({ page }) => {
  await inputThenMapping(page);
  const lines = Array.from({ length: 250 }, (_, i) => `row${i},${i}`).join('\n');
  await chooseFile(page, csv(`k,v\n${lines}\n`, 'big.csv'));
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(panel(page).getByText('Showing the first 100 of 250 rows.')).toBeVisible({ timeout: 30_000 });
  await expect(rows(page)).toHaveCount(100);
});

test('dates are shown as 30 Sep 2026', async ({ page }) => {
  await inputThenMapping(page);
  await chooseFile(page, csv('day,hours\n2026-09-30,8\n'));
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(rows(page).first()).toContainText('30 Sep 2026', { timeout: 30_000 });
});

test('an engine error is shown next to the preview with what failed and what to do', async ({ page }) => {
  await inputThenMapping(page);
  await chooseFile(page, csv('a,a\n1,2\n', 'dup.csv'));
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  const alert = panel(page).getByRole('alert');
  await expect(alert).toContainText('The preview could not run.', { timeout: 30_000 });
  await expect(alert).toContainText('more than once');
});

test('changing the effective date after a preview marks it as out of date', async ({ page }) => {
  await inputThenMapping(page);
  await chooseFile(page, csv('name\nAnn\n'));
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(rows(page)).toHaveCount(1, { timeout: 30_000 });
  await panel(page).getByRole('button', { name: /^Effective date for the preview:/ }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.keyboard.press('Enter');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Preview again' })).toBeVisible();
});

test('a Filter offers both outputs; an Output step with no input asks for one', async ({ page }) => {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Outputs');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Filter');
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  const group = panel(page).getByRole('group', { name: 'Output of the step' });
  await expect(group.getByRole('button', { name: 'Match', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: 'No match', exact: true }).click();
  await expect(group.getByRole('button', { name: 'No match', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await addStep(page, 'Output');
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await expect(panel(page).getByRole('alert')).toContainText('This step has no input yet');
});

test('a preview sends no request that carries file content', async ({ page }) => {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(`${r.method()} ${r.url()} ${r.postData() ?? ''}`));
  await inputThenMapping(page);
  await chooseFile(page, csv('name,note\nAnn,ZEBRA-4711\n'));
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(rows(page).first()).toContainText('ZEBRA-4711', { timeout: 30_000 });
  expect(seen.filter((r) => r.includes('ZEBRA'))).toEqual([]);
  const origin = new URL(page.url()).origin;
  for (const r of seen) {
    const [method, url] = r.split(' ');
    if (url?.startsWith('blob:') || url?.startsWith('data:')) continue;
    expect(method).toBe('GET');
    expect(url?.startsWith(origin)).toBe(true);
  }
});
