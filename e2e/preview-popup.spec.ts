import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// T8.7: the preview in a large popup (SPEC 15.3).
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string, name = 'people.csv') => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
const big = (n: number) => csv(`k,v\n${Array.from({ length: n }, (_, i) => `row${i + 1},${i + 1}`).join('\n')}\n`, `big${n}.csv`);

async function previewOf(page: Page, file: ReturnType<typeof csv>) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Popup test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, 'Column mapping');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').setInputFiles(file);
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(panel(page).getByRole('table', { name: 'Preview rows' })).toBeVisible({ timeout: 30_000 });
}
const popup = (page: Page) => page.getByRole('dialog', { name: 'Preview of Column mapping' });
const expand = (page: Page) => panel(page).getByRole('button', { name: 'Expand the preview' });
const popupRows = (page: Page) => popup(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');

test('Expand opens the popup with the same rows, row numbers and the count; Escape closes it and focus returns', async ({ page }) => {
  await previewOf(page, big(250));
  await expand(page).focus();
  await page.keyboard.press('Enter');
  await expect(popup(page)).toBeVisible();
  await expect(popupRows(page)).toHaveCount(100);
  await expect(popup(page).getByRole('rowheader').first()).toHaveText('1');
  // The row numbers take the room of their digits, not an equal share of the table.
  expect((await popup(page).getByRole('rowheader').first().boundingBox())!.width).toBeLessThan(120);
  await expect(popup(page).getByText('Showing the first 100 of 250 rows.')).toBeVisible();
  await expect(popup(page).getByRole('button', { name: 'First rows' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(popup(page)).toBeHidden();
  await expect(expand(page)).toBeFocused();
});

test('Last rows shows the last 100 with their real numbers', async ({ page }) => {
  await previewOf(page, big(250));
  await expand(page).click();
  await popup(page).getByRole('button', { name: 'Last rows' }).click();
  await expect(popup(page).getByText('Showing the last 100 of 250 rows (rows 151 to 250).')).toBeVisible({ timeout: 30_000 });
  await expect(popup(page).getByRole('rowheader').first()).toHaveText('151');
  await expect(popup(page).getByRole('rowheader').last()).toHaveText('250');
  await expect(popup(page).getByRole('button', { name: 'Last rows' })).toHaveAttribute('aria-pressed', 'true');
});

test('Find keeps the rows that contain the text, not case sensitive, with the count and their own row numbers', async ({ page }) => {
  await previewOf(page, big(250));
  await expand(page).click();
  await popup(page).getByRole('textbox', { name: 'Find in the loaded rows' }).fill('ROW9');
  // row9 and row90 to row99 in the first 100 rows
  await expect(popupRows(page)).toHaveCount(11);
  await expect(popup(page).getByText('11 of 100 rows match')).toBeVisible();
  await expect(popup(page).getByRole('rowheader').first()).toHaveText('9');
  await popup(page).getByRole('textbox', { name: 'Find in the loaded rows' }).fill('no such text');
  await expect(popup(page).getByText(/No loaded row contains this text/)).toBeVisible();
  await popup(page).getByRole('textbox', { name: 'Find in the loaded rows' }).fill('');
  await expect(popupRows(page)).toHaveCount(100);
});

test('Show more loads all 250 rows of a small table and then has nothing more to show', async ({ page }) => {
  await previewOf(page, big(250));
  await expand(page).click();
  const more = popup(page).getByRole('button', { name: 'Show more' });
  await expect(more).toBeEnabled();
  await more.click();
  await expect(popupRows(page)).toHaveCount(250, { timeout: 30_000 });
  await expect(popup(page).getByText('250 rows.')).toBeVisible();
  await expect(more).toBeDisabled();
  // Closing the popup leaves the Test tab at 100 rows.
  await popup(page).getByRole('button', { name: 'Close' }).click();
  await expect(panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr')).toHaveCount(100);
});

test('a table of 1,500 rows loads at most 1,000', async ({ page }) => {
  await previewOf(page, big(1500));
  await expand(page).click();
  await popup(page).getByRole('button', { name: 'Show more' }).click();
  await expect(popup(page).getByText('Showing the first 1,000 of 1,500 rows.')).toBeVisible({ timeout: 60_000 });
  await expect(popupRows(page)).toHaveCount(1000);
  await expect(popup(page).getByRole('button', { name: 'Show more' })).toBeDisabled();
  await expect(popup(page).getByRole('rowheader').last()).toHaveText('1,000');
  // Find works on the loaded rows only.
  await popup(page).getByRole('textbox', { name: 'Find in the loaded rows' }).fill('row1500');
  await expect(popup(page).getByText(/No loaded row contains/)).toBeVisible();
});

test('the popup says when the settings changed after the preview', async ({ page }) => {
  await previewOf(page, big(250));
  await panel(page).getByRole('button', { name: /^Effective date for the preview:/ }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.keyboard.press('Enter');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Preview again' })).toBeVisible();
  await expand(page).click();
  await expect(popup(page).getByRole('status').filter({ hasText: 'changed after this preview' })).toBeVisible();
  // The rows are still shown, marked as out of date.
  await expect(popupRows(page)).toHaveCount(100);
});

test('the popup keeps the toolbar in place while the table scrolls, and nothing leaves the browser', async ({ page }) => {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(`${r.method()} ${r.url()} ${r.postData() ?? ''}`));
  await previewOf(page, csv(`k,v\n${Array.from({ length: 300 }, (_, i) => `ZEBRA-${i},${i}`).join('\n')}\n`, 'z.csv'));
  await expand(page).click();
  await popup(page).getByRole('button', { name: 'Show more' }).click();
  await expect(popupRows(page)).toHaveCount(300, { timeout: 30_000 });
  const bar = popup(page).getByRole('button', { name: 'Show more' });
  const before = (await bar.boundingBox())!;
  await popup(page).getByRole('region', { name: 'Preview rows' }).evaluate((el) => { el.scrollTop = 2000; });
  const after = (await bar.boundingBox())!;
  expect(after.y).toBe(before.y);
  expect(seen.filter((r) => r.includes('ZEBRA'))).toEqual([]);
  const origin = new URL(page.url()).origin;
  for (const r of seen) {
    const [method, url] = r.split(' ');
    if (url?.startsWith('blob:') || url?.startsWith('data:')) continue;
    expect(method).toBe('GET');
    expect(url?.startsWith(origin)).toBe(true);
  }
});
