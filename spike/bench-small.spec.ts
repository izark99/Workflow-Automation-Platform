import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { writeCsv, writeXlsx } from '../scripts/lib/bench-data.ts';

// Header plus 2,000 data rows: small enough to run in seconds, same shape as the real files.
const TOTAL_ROWS = 2001;
let dir = '';

test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bench-small-'));
  await writeXlsx(join(dir, 'small.xlsx'), TOTAL_ROWS);
  await writeCsv(join(dir, 'small.csv'), TOTAL_ROWS);
});
test.afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function runBench(page: import('@playwright/test').Page, file: string, strategy: string) {
  await page.goto('/bench/');
  await page.locator('#file').setInputFiles(join(dir, file));
  await page.locator('#strategy').selectOption(strategy);
  await page.locator('#run').click();
  await expect(page.locator('#result')).toContainText('"strategy"', { timeout: 90_000 });
  return JSON.parse((await page.locator('#result').textContent()) ?? '{}');
}

for (const [file, strategy] of [
  ['small.xlsx', 'sheetjs-whole'],
  ['small.xlsx', 'xlsx-stream'],
  ['small.csv', 'sheetjs-whole'],
  ['small.csv', 'duckdb-csv'],
] as const) {
  test(`${file} with ${strategy} loads every row and groups`, async ({ page }) => {
    const r = await runBench(page, file, strategy);
    expect(r.ok, r.error).toBe(true);
    expect(r.rows).toBe(TOTAL_ROWS - 1);
    expect(r.columns).toBe(40);
    expect(r.groups).toBeGreaterThan(100);
    expect(r.groups).toBeLessThanOrEqual(200);
    expect(r.loadMs).toBeGreaterThan(0);
  });
}

test('xlsx-stream on a csv file reports an error that says what to do', async ({ page }) => {
  const r = await runBench(page, 'small.csv', 'xlsx-stream');
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/not a valid \.xlsx.*save/i);
});

test('duckdb-csv on an xlsx file reports an error that says what to do', async ({ page }) => {
  const r = await runBench(page, 'small.xlsx', 'duckdb-csv');
  expect(r.ok).toBe(false);
  expect(r.error).toContain('csv');
});
