import { mkdtempSync, readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { MAX_SAFE_XLSX_BYTES } from '../src/engine/size-guard';
import { seedRunnableFlow } from './runnable-flow';

// The tests count months and days back from "today", so today is fixed: they do not depend on the day they run.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T09:00:00+07:00'));
});

const csv = (text: string, name = 'people.csv') => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
const DATA = 'name,kind\nAnn,WEEK\nBob,MONTH\nCy,YEAR\n';

const open = async (page: Page) => {
  await seedRunnableFlow(page);
  await page.goto('/flows/flow-run/run');
  await expect(page.getByRole('heading', { name: 'Run flow', level: 1 })).toBeVisible();
};
const chooseFile = (page: Page, file: ReturnType<typeof csv> | string) => page.locator('input[type=file]').setInputFiles(file);
const runButton = (page: Page) => page.getByRole('button', { name: /^Run flow$|^Run again$/ });

test('the screen has the three steps, the privacy line, and lists the versions that today uses', async ({ page }) => {
  await open(page);
  // The privacy line is the text of the info button after the title (SPEC 11.2): not visible until it is opened.
  await expect(page.getByText('Your files are read on this device.')).toHaveCount(0);
  await page.getByRole('button', { name: 'About Run flow' }).click();
  await expect(page.getByText('Your files are read on this device. Nothing is uploaded to the server.')).toBeVisible();
  for (const h of ['1. Choose the effective date', '2. Add the input files']) await expect(page.getByRole('heading', { name: h })).toBeVisible();
  const versions = page.getByRole('group', { name: 'Versions used for this date' });
  await expect(versions).toContainText('Run test flow v1');
  await expect(versions).toContainText('From 01 Jan 2026');
  await expect(versions).toContainText('OT limits v1');
  await expect(runButton(page)).toBeDisabled();
});

test('a date that no version covers stops with the engine message, and Run stays off', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Effective date:/ }).click();
  for (let i = 0; i < 11; i++) await page.keyboard.press('PageUp');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('No version can be used for this date.');
  await expect(page.getByRole('alert')).toContainText('Run test flow');
  // Without a usable version the flow's inputs are not known, so no file is asked for and nothing can run.
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(runButton(page)).toBeDisabled();
});

test('with a file the flow runs in the browser; the result shows the sheet with its rows, and the workbook downloads', async ({ page }) => {
  await open(page);
  await chooseFile(page, csv(DATA));
  await expect(page.getByText('people.csv, ')).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  await runButton(page).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'People, 3 rows' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Preview of People: 3 of 3 rows.')).toBeVisible();
  const table = page.getByRole('table', { name: 'Preview of People' });
  await expect(table.getByRole('columnheader')).toHaveText(['name', 'kind', 'limit']);
  await expect(table.locator('tbody tr').nth(0)).toContainText('16');
  await expect(table.locator('tbody tr').nth(1)).toContainText('40');
  await expect(table.locator('tbody tr').nth(2).locator('td').nth(2)).toHaveText('');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Result.xlsx' }).click()]);
  expect(download.suggestedFilename()).toBe('Result.xlsx');
  const path = join(mkdtempSync(join(tmpdir(), 'dfw-')), 'Result.xlsx');
  await download.saveAs(path);
  const wb = XLSX.read(readFileSync(path));
  expect(wb.SheetNames).toEqual(['People']);
  expect(XLSX.utils.sheet_to_json(wb.Sheets['People']!, { header: 1 })).toEqual([['name', 'kind', 'limit'], ['Ann', 'WEEK', 16], ['Bob', 'MONTH', 40], ['Cy', 'YEAR']]);
});

test('the run log keeps counts and ids only: no names and no cell values', async ({ page }) => {
  await open(page);
  await chooseFile(page, csv(DATA));
  await runButton(page).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  const log = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('data-flow-webapp', 1);
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const get = open.result.transaction('snapshot').objectStore('snapshot').get('v1');
          get.onsuccess = () => resolve(get.result.runLog as unknown[]);
        };
      }),
  );
  expect(log).toHaveLength(1);
  const entry = log[0] as Record<string, unknown>;
  expect(Object.keys(entry).sort()).toEqual(['effectiveDate', 'flowId', 'id', 'inputRows', 'outputRows', 'runAt', 'status', 'userId', 'versionNo']);
  expect(entry).toMatchObject({ flowId: 'flow-run', versionNo: 1, inputRows: 3, outputRows: 3, status: 'ok' });
  expect(JSON.stringify(log)).not.toContain('Ann');
});

test('an engine error is shown next to the run with what failed; Run again works after a better file', async ({ page }) => {
  await open(page);
  await chooseFile(page, csv('name,other\nAnn,x\n'));
  await runButton(page).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('The run could not finish.', { timeout: 60_000 });
  await expect(alert).toContainText('kind');
  await chooseFile(page, csv(DATA));
  await runButton(page).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
});

test('an xlsx file above the safe size is refused with the "save as csv" message and no run starts', async ({ page }) => {
  await open(page);
  const path = join(mkdtempSync(join(tmpdir(), 'dfw-')), 'big.xlsx');
  writeFileSync(path, '');
  truncateSync(path, MAX_SAFE_XLSX_BYTES + 1_000_000); // a sparse file: nothing is read
  await chooseFile(page, path);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('big.xlsx is 301.0 MB');
  await expect(alert).toContainText('save the sheet as .csv');
  await expect(page.getByText('No file chosen')).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});

test('a run sends no request that carries file content', async ({ page }) => {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(`${r.method()} ${r.url()} ${r.postData() ?? ''}`));
  await open(page);
  await chooseFile(page, csv('name,kind\nZEBRA-4711,WEEK\n'));
  await runButton(page).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  expect(seen.filter((r) => r.includes('ZEBRA'))).toEqual([]);
  const origin = new URL(page.url()).origin;
  for (const r of seen) {
    const [method, url] = r.split(' ');
    if (url?.startsWith('blob:') || url?.startsWith('data:')) continue;
    expect(method).toBe('GET');
    expect(url?.startsWith(origin)).toBe(true);
  }
});

test('a flow without a published version says so and points to the builder', async ({ page }) => {
  await page.goto('/flows/flow-insurance/run');
  await expect(page.getByRole('alert')).toContainText('This flow has no published version yet.');
  await expect(page.getByRole('link', { name: 'Open the builder' })).toHaveAttribute('href', '/flows/flow-insurance/versions/1');
});
