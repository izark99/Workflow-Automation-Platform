import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';
import { pickDate } from './journey-data';

// The first and the last day of a draft version can be changed (flows and reference tables), also when the flow or table is made,
// as long as the version shares no day with a published version.
const TODAY = '2026-11-17';
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${TODAY}T09:00:00+07:00`));
});
const toastWith = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

test('a draft flow version: dates that overlap a published version are refused; free dates are saved', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  await page.getByRole('button', { name: 'Edit dates', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Dates of v4' });
  await expect(dialog.getByRole('button', { name: /^Valid from: 1 Jan 2027/ })).toBeVisible();
  // v3 starts on 01 Jul 2026 and has no end: 15 Jun 2026 is inside v2.
  await pickDate(page, /^Valid from:/, '2027-01-01', '2026-06-15');
  await expect(dialog.getByText(/overlap v2/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save dates' })).toBeDisabled();
  // An end before the start is refused too.
  await pickDate(page, /^Valid from:/, '2026-06-15', '2027-01-10');
  await dialog.getByRole('switch', { name: 'No end date' }).click();
  await pickDate(page, /^Valid to:/, '2027-01-10', '2027-01-05');
  await expect(dialog.getByText(/before the start/)).toBeVisible();
  await pickDate(page, /^Valid to:/, '2027-01-05', '2027-03-20');
  await expect(dialog.getByRole('button', { name: 'Save dates' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Save dates' }).click();
  await expect(toastWith(page, 'Dates of v4 saved.')).toBeVisible();
  await page.goto('/flows/flow-timesheet/versions');
  const row = page.getByRole('table', { name: 'Versions' }).locator('tbody tr').filter({ hasText: 'v4' });
  await expect(row).toContainText('10 Jan 2027');
  await expect(row).toContainText('20 Mar 2027');
});

test('a published version has no Edit dates', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/3');
  await expect(page.getByRole('button', { name: 'New version' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit dates', exact: true })).toHaveCount(0);
});

test('a draft reference table version: the dates can be changed, and an overlap is refused', async ({ page }) => {
  const s = seedSnapshot();
  const t = s.refTables.find((x) => x.id === 'ref-attendance')!;
  t.versions.push({ versionNo: 3, validFrom: '2026-09-01', validTo: null, status: 'draft', columns: t.versions[1]!.columns, rows: t.versions[1]!.rows });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
  await page.goto('/reference-tables?table=ref-attendance&v=3');
  await page.getByRole('button', { name: /^More actions for this table/ }).click();
  await page.getByRole('option', { name: 'Edit dates', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Dates of v3' });
  // v2 starts on 01 Jul 2026 and has no end: a start on 05 Jun 2026 is inside v1, which ends on 30 Jun 2026.
  await pickDate(page, /^Valid from:/, '2026-09-01', '2026-06-05');
  await expect(dialog.getByText(/overlap v1/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save dates' })).toBeDisabled();
  await pickDate(page, /^Valid from:/, '2026-06-05', '2026-10-05');
  await dialog.getByRole('button', { name: 'Save dates' }).click();
  await expect(toastWith(page, 'Dates of v3 saved.')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Versions of the table' }).getByRole('button', { name: /^v3, draft from 05 Oct 2026/ })).toBeVisible();
});

test('a new flow and a new reference table take the first day that the person picks', async ({ page }) => {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).first().click();
  const make = page.getByRole('dialog', { name: 'Create flow' });
  await make.getByRole('textbox', { name: 'Flow name' }).fill('Dated flow');
  await pickDate(page, /^Valid from:/, TODAY, '2026-12-05');
  await make.getByRole('button', { name: 'Create flow' }).click();
  await expect(page.getByRole('heading', { name: 'Dated flow', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Edit dates', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Dates of v1' }).getByRole('button', { name: /^Valid from: 5 Dec 2026/ })).toBeVisible();

  await page.goto('/reference-tables');
  await page.getByRole('button', { name: 'New table' }).first().click();
  const table = page.getByRole('dialog', { name: 'New reference table' });
  await table.getByRole('textbox', { name: 'Table name' }).fill('dated_table');
  await table.getByRole('textbox', { name: /^Header row and rows from Excel/ }).fill('code\tvalue\nA\t1');
  await pickDate(page, /^Valid from:/, TODAY, '2026-12-05');
  await table.getByRole('button', { name: 'Create table' }).click();
  await expect(page.getByRole('group', { name: 'Versions of the table' }).getByRole('button', { name: /^v1, draft from 05 Dec 2026/ })).toBeVisible();
});
