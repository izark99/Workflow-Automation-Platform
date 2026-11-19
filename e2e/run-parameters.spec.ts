import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedParameterFlow } from './parameter-flow';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T09:00:00+07:00'));
});

const csv = (text: string) => ({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const DATA = 'name,joined\nAnn,2026-09-01\nBob,2026-09-15\nCy,2026-09-30\n';
const MARKER = 'PARAM-MARKER-Le Thi Mai 5e8d';

async function seed(page: Page, parameters?: unknown[]) {
  await seedParameterFlow(page, parameters);
  await page.goto('/flows/flow-param/run');
  await expect(page.getByRole('heading', { name: 'Run flow', level: 1 })).toBeVisible();
}

const runButton = (page: Page) => page.getByRole('button', { name: /^Run flow$|^Run again$/ });

test('the Parameters card sits above the files; Run stays off until the values are valid; the value is used by the Filter', async ({ page }) => {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(`${r.method()} ${r.url()} ${r.postData() ?? ''}`));
  await seed(page);
  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(headings.slice(0, 3)).toEqual(['1. Choose the effective date', '2. Enter the parameters', '3. Add the input files']);

  await page.locator('input[type=file]').setInputFiles(csv(DATA));
  await expect(page.getByText('people.csv, ')).toBeVisible();
  // A required date with no default is blank: the error is under the field and Run is off.
  await expect(page.getByRole('alert').filter({ hasText: 'cutoff' })).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Choose a date for Cut-off date' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(runButton(page)).toBeEnabled();

  // 17 Nov is today; two months back and two days back gives 15 Sep 2026.
  await page.getByRole('button', { name: /^Cut-off date/ }).click();
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Cut-off date.*15 Sep 2026/ })).toBeVisible();
  await page.getByRole('textbox', { name: 'Note' }).fill(MARKER);
  await runButton(page).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  const table = page.getByRole('table', { name: 'Preview of People' });
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr').nth(1)).toContainText(`Bob ${MARKER}`);

  // The values stay in the browser: no request carries them, and nothing was posted.
  expect(seen.filter((r) => r.includes(MARKER))).toEqual([]);
  const origin = new URL(page.url()).origin;
  for (const r of seen) {
    const [method, url] = r.split(' ');
    if (url?.startsWith('blob:') || url?.startsWith('data:')) continue;
    expect(method).toBe('GET');
    expect(url?.startsWith(origin)).toBe(true);
  }
});

test('a flow without parameters has no Parameters card and keeps its three steps', async ({ page }) => {
  await seed(page, []);
  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(headings.slice(0, 2)).toEqual(['1. Choose the effective date', '2. Add the input files']);
});
