// Gate G3: the journeys of a user, from the browser, on the local data store, at 1440 x 900.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { compareWorkbooks, formatComparison, readWorkbook } from '../scripts/lib/compare-workbooks';
import { seedRunnableFlow } from './runnable-flow';
import { DATASETS, pickDate, seedTimesheet, signInAs } from './journey-data';

const TODAY = '2026-11-17';
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${TODAY}T09:00:00+07:00`));
});

const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const cards = (page: Page) => page.locator('.react-flow__node');
const card = (page: Page, text: string) => cards(page).filter({ hasText: text });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const toastWith = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const csv = (text: string, name = 'people.csv') => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

async function saveDownload(download: Download): Promise<Uint8Array> {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'dfw-')), download.suggestedFilename());
  await download.saveAs(file);
  return new Uint8Array(readFileSync(file));
}

/** Drags from the output handle of one card to the input handle of another, with the mouse. */
async function connect(page: Page, from: string, to: string): Promise<void> {
  const a = await card(page, from).locator('.react-flow__handle.source').first().boundingBox();
  const b = await card(page, to).locator('.react-flow__handle.target').first().boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 8 });
  await page.mouse.up();
}

test('journey 1: a user builds a flow on an empty canvas, previews a step, publishes, runs it and downloads the workbook they expect', async ({ page }) => {
  test.setTimeout(180_000);
  // Create the flow: the canvas starts empty.
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Journey flow');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await expect(cards(page)).toHaveCount(0);
  await expect(panel(page)).toContainText('Select a step on the canvas');

  // Add the steps; each one is connected to the step that was selected.
  await addStep(page, 'Input file');
  await addStep(page, 'Formula column');
  await addStep(page, 'Filter');
  await addStep(page, 'Output');
  await expect(cards(page)).toHaveCount(4);
  // Each step was added with the one before it selected, so it is connected to it (SPEC 15.2): Filter through match.
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);

  // Configure each step.
  await card(page, 'Input file').click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await panel(page).getByRole('textbox', { name: 'File name on the run screen' }).fill('people');
  await card(page, 'Formula column').click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await panel(page).getByRole('textbox', { name: 'New column name' }).fill('double');
  await panel(page).getByRole('textbox', { name: 'Formula' }).fill('[age] * 2');
  await card(page, 'Filter').click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await panel(page).getByRole('textbox', { name: 'Condition' }).fill('[double] > 70');
  await card(page, 'Output').click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await panel(page).getByRole('textbox', { name: 'Sheet name' }).fill('Result');

  // Preview the Filter step on a test file: the rows that match.
  await card(page, 'Filter').click();
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').setInputFiles(csv('name,age\nAnn,31\nBob,42\nCy,36\n'));
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  const preview = panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');
  await expect(preview).toHaveCount(2, { timeout: 60_000 });
  await expect(preview.nth(0)).toContainText('Bob');
  await expect(preview.nth(0)).toContainText('84');
  await expect(preview.nth(1)).toContainText('Cy');

  // Publish, then run from the Run button.
  await page.getByRole('banner').getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog', { name: 'Publish v1?' }).getByRole('button', { name: 'Publish' }).click();
  await expect(toastWith(page, 'v1 published.')).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'Run' }).click();
  await expect(page).toHaveURL(/\/run$/);
  await expect(page.getByRole('group', { name: 'Versions used for this date' })).toContainText('Journey flow v1');
  await page.locator('input[aria-label="Choose file: people"]').setInputFiles(csv('name,age\nAnn,31\nBob,42\nCy,36\n'));
  await page.getByRole('button', { name: 'Run flow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('tab', { name: 'Result, 2 rows' })).toBeVisible();

  // Download the workbook and compare it, cell by cell, with the workbook the user expects.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Result.xlsx' }).click()]);
  const expected = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(expected, XLSX.utils.aoa_to_sheet([['name', 'age', 'double'], ['Bob', 42, 84], ['Cy', 36, 72]]), 'Result');
  const expectedBytes = new Uint8Array(XLSX.write(expected, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  const comparison = compareWorkbooks(readWorkbook(expectedBytes), readWorkbook(await saveDownload(download)), ['Result']);
  expect(comparison.ok, formatComparison(comparison)).toBe(true);
});

for (const ds of DATASETS) {
  test(`journey 2: the monthly timesheet flow runs on the ${ds.name} files and the downloaded workbook equals the expected one`, async ({ page }) => {
    test.setTimeout(240_000);
    await seedTimesheet(page, ds);
    await page.goto('/flows/flow-ts/run');
    await pickDate(page, /^Effective date:/, TODAY, ds.effectiveDate);
    const versions = page.getByRole('group', { name: 'Versions used for this date' });
    await expect(versions).toContainText('Timesheet journey v1');
    for (const t of ds.referenceSheets ?? []) await expect(versions).toContainText(`${t} v1`);
    for (const [key, file] of Object.entries(ds.inputs)) await page.locator(`input[aria-label="Choose file: ${key}"]`).setInputFiles(path.join(ds.dir, file));
    await page.getByRole('button', { name: 'Run flow', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 180_000 });
    for (const sheet of ['Summary', 'Exceptions', 'OT_breaches']) await expect(page.getByRole('tab', { name: new RegExp(`^${sheet}, \\d+ rows?$`) })).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download .*\.xlsx$/ }).click()]);
    const expected = readWorkbook(new Uint8Array(readFileSync(path.join(ds.dir, ds.expectedFile))));
    const comparison = compareWorkbooks(expected, readWorkbook(await saveDownload(download)), ['Summary', 'Exceptions', 'OT_breaches']);
    console.log(`${ds.name}: ${formatComparison(comparison)}`);
    expect(comparison.ok, formatComparison(comparison)).toBe(true);
  });
}

test('journey 3: a new reference table version, published with a start date, is used for the dates it covers and the old one for earlier dates', async ({ page }) => {
  test.setTimeout(180_000);
  await seedRunnableFlow(page);
  const data = 'name,kind\nAnn,WEEK\n';

  // The admin makes v2 of "OT limits" from 01 Jul 2026 with a higher weekly limit and publishes it.
  await page.goto('/reference-tables?table=ref-ot-limits');
  await page.getByRole('button', { name: 'New version', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New version from v1' });
  await pickDate(page, /^Valid from:/, TODAY, '2026-07-01');
  await expect(dialog.getByRole('button', { name: /^Valid from: 1 Jul 2026/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Create version' }).click();
  await expect(toastWith(page, 'v2 created as a draft.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Row 1, limit_hours' }).fill('20');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(toastWith(page, 'Changes saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const publish = page.getByRole('dialog', { name: 'Publish v2?' });
  await expect(publish).toContainText('Publishing v2 will end v1 on 30 Jun 2026');
  await publish.getByRole('button', { name: 'Publish' }).click();
  await expect(toastWith(page, 'v2 published.')).toBeVisible();

  // A run for 15 Jun 2026 uses v1 of the table (limit 16) ...
  await page.goto('/flows/flow-run/run');
  await pickDate(page, /^Effective date:/, TODAY, '2026-06-15');
  const versions = page.getByRole('group', { name: 'Versions used for this date' });
  await expect(versions).toContainText('OT limits v1');
  await expect(versions).toContainText('01 Jan 2026 to 30 Jun 2026');
  await page.locator('input[aria-label="Choose file: people"]').setInputFiles(csv(data));
  await page.getByRole('button', { name: 'Run flow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  const first = page.getByRole('table', { name: 'Preview of People' }).locator('tbody tr').first();
  await expect(first.locator('td').nth(2)).toHaveText('16');

  // ... and a run for 30 Sep 2026 uses v2 (limit 20), with the same file.
  await pickDate(page, /^Effective date:/, '2026-06-15', '2026-09-30');
  await expect(versions).toContainText('OT limits v2');
  await expect(versions).toContainText('From 01 Jul 2026');
  await page.getByRole('button', { name: 'Run flow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('table', { name: 'Preview of People' }).locator('tbody tr').first().locator('td').nth(2)).toHaveText('20');
});

test('journey 4: the admin shares a flow with a group; a member can view and run but not change it; a user deletes a personal flow and the admin restores it', async ({ page }) => {
  test.setTimeout(180_000);
  const flowRows = (p: Page) => p.getByRole('table', { name: 'Flows' }).locator('tbody tr');

  // The admin closes the timesheet flow to the HR Analytics group. Minh is in that group only.
  await page.goto('/admin');
  const box = page.getByRole('checkbox', { name: 'HR Analytics can view and run Monthly timesheet summary' });
  await box.click();
  await expect(toastWith(page, 'Access updated.')).toBeVisible();
  await signInAs(page, 'user-minh');
  await page.goto('/flows');
  await expect(flowRows(page).filter({ hasText: 'Monthly timesheet summary' })).toHaveCount(0);
  await expect(flowRows(page).filter({ hasText: 'Headcount report cleanup' })).toHaveCount(1);
  await expect(flowRows(page).filter({ hasText: 'Insurance list merge' })).toHaveCount(1);
  await expect(flowRows(page).filter({ hasText: 'OT by department' })).toHaveCount(0); // another user's personal flow

  // The admin opens it again; Minh can now view and run it, not change it, and has no Delete for it.
  await signInAs(page, 'user-harold');
  await page.goto('/admin');
  await page.getByRole('checkbox', { name: 'HR Analytics can view and run Monthly timesheet summary' }).click();
  await expect(toastWith(page, 'Access updated.')).toBeVisible();
  await signInAs(page, 'user-minh');
  await page.goto('/flows');
  const shared = flowRows(page).filter({ hasText: 'Monthly timesheet summary' });
  await expect(shared).toHaveCount(1);
  await expect(shared.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
  await expect(shared.getByRole('link', { name: /^Run/ })).toBeVisible();
  await shared.getByRole('link', { name: /^Open/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'only the admin can change it' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add step Filter' })).toBeDisabled();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/flows$/); // no Admin screen for a user who is not the admin

  // Minh deletes a personal flow after a confirmation that names it.
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Delete Insurance list merge' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete Insurance list merge?' });
  await expect(confirm).toContainText('restore it within 30 days');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(flowRows(page).filter({ hasText: 'Insurance list merge' })).toHaveCount(0);

  // The admin finds it under Deleted flows, with its owner, and restores it.
  await signInAs(page, 'user-harold');
  await page.goto('/admin');
  const deleted = page.getByRole('table', { name: 'Deleted flows' }).locator('tbody tr').filter({ hasText: 'Insurance list merge' });
  await expect(deleted).toContainText('Minh');
  await deleted.getByRole('button', { name: 'Restore Insurance list merge' }).click();
  await expect(toastWith(page, 'Insurance list merge restored.')).toBeVisible();

  // Minh has it again.
  await signInAs(page, 'user-minh');
  await page.goto('/flows');
  await expect(flowRows(page).filter({ hasText: 'Insurance list merge' })).toHaveCount(1);
});
