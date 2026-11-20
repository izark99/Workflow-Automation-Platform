import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { REF_FLOW, browserToday, seedReferenceStep } from './reference-step-flow';

const settings = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const card = (page: Page) => page.locator('.react-flow__node').first();
async function openConfigure(page: Page) {
  await page.goto(REF_FLOW);
  await card(page).click();
  await settings(page).getByRole('tab', { name: 'Configure' }).click();
}
const choose = async (page: Page, table: string) => {
  await settings(page).getByRole('button', { name: /^Table/ }).click();
  await page.getByRole('option', { name: table, exact: true }).click();
};

test('the Configure tab offers every table, shows the columns and the version of the test date, and the card follows', async ({ page }) => {
  await seedReferenceStep(page);
  await openConfigure(page);
  await settings(page).getByRole('button', { name: /^Table/ }).click();
  const names = await page.getByRole('option').allTextContents();
  expect(names).toEqual(expect.arrayContaining(['Attendance codes', 'OT types', 'Closed range', 'Old limits', 'Dated']));
  await page.getByRole('option', { name: 'Closed range', exact: true }).click();
  await expect(card(page)).toContainText('Closed range');
  await expect(settings(page).getByRole('status')).toContainText(/Version used on \d+ \w+ \d{4}: v1, from 1 Jan 2026 to 31 Dec 2099\./);
  const list = settings(page).getByRole('region', { name: 'Columns' });
  await expect(list.getByRole('listitem')).toHaveText(['codeText', 'limitNumber']);
  expect(await settings(page).getByRole('alert').count()).toBe(0);
});

test('a table that no version covers on the test date gives an error that names the table, the date and what to do', async ({ page }) => {
  await seedReferenceStep(page);
  await openConfigure(page);
  await choose(page, 'Old limits');
  const alert = settings(page).getByRole('alert');
  await expect(alert).toContainText('Old limits');
  await expect(alert).toContainText(/No version of reference table "Old limits" is valid on/);
  await expect(alert).toContainText('Add a version that covers this date');
  await expect(settings(page).getByRole('status')).toHaveCount(0);
  await expect(settings(page).getByRole('region', { name: 'Columns' }).getByRole('listitem')).toHaveCount(2);
});

test('a table that is not in the list is said to be missing, and stays visible in the dropdown', async ({ page }) => {
  await seedReferenceStep(page, { nodes: [{ id: 'ref', type: 'reference_table', label: 'Reference table', position: { x: 0, y: 0 }, settings: { table: 'Gone' } }] });
  await openConfigure(page);
  await expect(settings(page).getByRole('alert')).toContainText('The table "Gone" is not in the list of tables.');
  await expect(settings(page).getByRole('button', { name: /^Table/ })).toContainText('Gone');
});

test('the test date of the Test tab selects the version that the Configure tab shows', async ({ page }) => {
  await page.goto('about:blank');
  const today = await browserToday(page);
  await seedReferenceStep(page, { today });
  await openConfigure(page);
  await choose(page, 'Dated');
  await expect(settings(page).getByRole('status')).toContainText(/: v2, from \d+ \w+ \d{4}\./);
  await settings(page).getByRole('tab', { name: 'Test' }).click();
  await page.getByRole('button', { name: /^Effective date for the preview:/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Previous month' }).click();
  await dialog.getByRole('button', { name: /^1 \w+ \d{4}$/ }).click();
  await settings(page).getByRole('tab', { name: 'Configure' }).click();
  await expect(settings(page).getByRole('status')).toContainText(/: v1, from 1 Jan 2000 to \d+ \w+ \d{4}\./);
});

test('a person who cannot read the table yet is told to save the flow, and reads it after the save', async ({ page }) => {
  await seedReferenceStep(page, { user: 'user-lan', nodes: [] });
  await page.goto(REF_FLOW);
  await page.getByRole('button', { name: 'Add step Reference table' }).click();
  await settings(page).getByRole('tab', { name: 'Configure' }).click();
  await choose(page, 'Closed range');
  await expect(settings(page).getByRole('status')).toHaveText('You cannot read this table yet. Save the flow to read this table.');
  await expect(settings(page).getByRole('region', { name: 'Columns' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(settings(page).getByRole('status')).toContainText('Version used on');
  await expect(settings(page).getByRole('region', { name: 'Columns' }).getByRole('listitem')).toHaveCount(2);
});

test('a published (read-only) version shows the table but cannot change it', async ({ page }) => {
  await seedReferenceStep(page, { status: 'published', nodes: [{ id: 'ref', type: 'reference_table', label: 'Reference table', position: { x: 0, y: 0 }, settings: { table: 'Closed range' } }] });
  await openConfigure(page);
  await expect(settings(page).getByRole('button', { name: /^Table/ })).toBeDisabled();
  await expect(settings(page).getByRole('status').filter({ hasText: 'Version used on' })).toBeVisible();
});
