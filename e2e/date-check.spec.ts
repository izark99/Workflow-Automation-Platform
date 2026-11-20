import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { REF_FLOW, seedReferenceStep } from './reference-step-flow';

// SPEC 13.3 item 7: the date check warns, and never blocks.
const GAP = 'Ends 2026 has no published version from 1 Jan 2027 to 31 Dec 2027: a run for these dates will stop.';
const step = (table: string) => [{ id: 'ref', type: 'reference_table', label: 'Reference table', position: { x: 0, y: 0 }, settings: { table } }];
const seed = (page: Page, table = 'Ends 2026') => seedReferenceStep(page, { nodes: step(table), validFrom: '2027-01-01', validTo: '2027-12-31' });
const publishDialog = (page: Page) => page.getByRole('dialog');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T09:00:00+07:00'));
});

test('the publish dialog warns about a gap, names the table and the days, and Publish stays enabled and works', async ({ page }) => {
  await seed(page);
  await page.goto(REF_FLOW);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(publishDialog(page).getByRole('status')).toHaveText(GAP);
  await expect(publishDialog(page).getByRole('alert')).toHaveCount(0);
  const confirm = publishDialog(page).getByRole('button', { name: 'Publish', exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(publishDialog(page)).toHaveCount(0);
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
});

test('a flow with no gap shows no warning in the publish dialog', async ({ page }) => {
  await seed(page, 'Closed range');
  await page.goto(REF_FLOW);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(publishDialog(page)).toBeVisible();
  await expect(publishDialog(page).getByRole('status')).toHaveCount(0);
});

test('the Reference table step shows the same warning under the dropdown', async ({ page }) => {
  await seed(page);
  await page.goto(REF_FLOW);
  await page.locator('.react-flow__node').first().click();
  const settings = page.getByRole('complementary', { name: 'Step settings' });
  await settings.getByRole('tab', { name: 'Configure' }).click();
  await expect(settings.getByRole('status').filter({ hasText: 'no published version' })).toHaveText(GAP);
  // Another table with no gap: the warning goes.
  await settings.getByRole('button', { name: /^Table/ }).click();
  await page.getByRole('option', { name: 'Closed range', exact: true }).click();
  await expect(settings.getByRole('status').filter({ hasText: 'no published version' })).toHaveCount(0);
});

test('adding the missing version of the table removes the warning', async ({ page }) => {
  await seed(page);
  await page.goto(REF_FLOW);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(publishDialog(page).getByRole('status')).toHaveText(GAP);
  await publishDialog(page).getByRole('button', { name: 'Cancel' }).click();
  // Add a version of the table that starts when the flow version does, and publish it.
  await page.getByRole('link', { name: 'Flows', exact: true }).click();
  await page.getByRole('link', { name: 'Reference tables' }).click();
  await page.getByRole('list', { name: 'Reference tables' }).getByRole('link', { name: /Ends 2026/ }).click();
  await page.getByRole('button', { name: 'New version', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create version' }).click();
  await expect(page.getByText('v2 created as a draft.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('dialog', { name: 'Publish v2?' }).getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'v2 published.' })).toBeVisible();
  // Back to the flow: no gap any more.
  await page.getByRole('link', { name: 'Flows', exact: true }).click();
  await page.getByRole('link', { name: /Reference step flow/ }).click();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(publishDialog(page)).toBeVisible();
  await expect(publishDialog(page).getByRole('status')).toHaveCount(0);
});

// T6.10b: the Run screen. The flow version is open ended from 2026 and the table ends on 31 Dec 2026.
const RUN_GAP = 'Ends 2026 has no published version from 1 Jan 2027: a run for these dates will stop.';
const publishedWith = (page: Page, table: string) => seedReferenceStep(page, { status: 'published', nodes: step(table) });

test('the Run screen shows the warning above the list of versions and the Run button is not blocked by it', async ({ page }) => {
  await publishedWith(page, 'Ends 2026');
  await page.goto('/flows/flow-refstep/run');
  const versions = page.getByRole('group', { name: 'Versions used for this date' });
  await expect(versions).toBeVisible();
  const warning = page.getByRole('status').filter({ hasText: 'no published version' });
  await expect(warning).toHaveText(RUN_GAP);
  // Above the list.
  const [w, l] = [await warning.boundingBox(), await versions.boundingBox()];
  expect(w!.y + w!.height).toBeLessThanOrEqual(l!.y);
  await expect(versions).toContainText('Ends 2026 v1');
  await expect(page.getByRole('button', { name: /^Run flow$/ })).toBeEnabled();
});

test('a table with no gap shows no warning on the Run screen', async ({ page }) => {
  // "Closed range" is valid to 2099: a flow version that is open ended would outrun it, so this one ends in 2027.
  await seedReferenceStep(page, { status: 'published', nodes: step('Closed range'), validTo: '2027-12-31' });
  await page.goto('/flows/flow-refstep/run');
  await expect(page.getByRole('group', { name: 'Versions used for this date' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'no published version' })).toHaveCount(0);
});

test('when the effective date is in the gap the run stops with its own message, and the warning still lists the gap', async ({ page }) => {
  await publishedWith(page, 'Ends 2026');
  await page.goto('/flows/flow-refstep/run');
  await page.getByRole('button', { name: /^Effective date:/ }).click();
  for (let i = 0; i < 2; i++) await page.keyboard.press('PageDown'); // 17 Nov 2026 -> 17 Jan 2027
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('No version can be used for this date.');
  await expect(page.getByRole('status').filter({ hasText: 'no published version' })).toHaveText(RUN_GAP);
  await expect(page.getByRole('button', { name: /^Run flow$/ })).toBeDisabled();
});
