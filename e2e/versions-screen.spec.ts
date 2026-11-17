import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

const URL = '/flows/flow-timesheet/versions';
const rows = (page: Page) => page.getByRole('table', { name: 'Versions' }).locator('tbody tr');
const toastWith = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const seed = async (page: Page, change: (s: ReturnType<typeof seedSnapshot>) => void) => {
  const s = seedSnapshot();
  change(s);
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
};
/** Opens a date picker and moves back by months and days with the keyboard. */
async function pickDate(page: Page, trigger: RegExp, keys: string[]) {
  await page.getByRole('button', { name: trigger }).click();
  for (const k of keys) await page.keyboard.press(k);
  await page.keyboard.press('Enter');
}

test('the timeline shows every version with its range, the note says what publishing does, and the table lists them newest first', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Versions', level: 1 })).toBeVisible();
  const timeline = page.getByRole('list', { name: 'Version timeline' });
  await expect(timeline.getByRole('listitem')).toHaveCount(4);
  await expect(timeline.getByRole('listitem').nth(0)).toContainText('v1');
  await expect(timeline.getByRole('listitem').nth(0)).toContainText('Jan to Mar 2026');
  await expect(timeline.getByRole('listitem').nth(2)).toContainText('v3, in effect');
  await expect(timeline.getByRole('listitem').nth(2)).toContainText('From Jul 2026, no end date');
  await expect(timeline.getByRole('listitem').nth(3)).toContainText('v4, draft');
  await expect(page.getByText('Versions cannot overlap. Publishing v4 will end v3 on 31 Dec 2026.')).toBeVisible();

  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).nth(0)).toContainText('v4');
  await expect(rows(page).nth(0)).toContainText('Draft');
  await expect(rows(page).nth(0)).toContainText('01 Jan 2027');
  await expect(rows(page).nth(0)).toContainText('No end date');
  await expect(rows(page).nth(0)).toContainText('New check for rest-day OT');
  await expect(rows(page).nth(1)).toContainText('Published, in effect');
  await expect(rows(page).nth(2)).toContainText('Published, ended');
  await expect(rows(page).nth(2)).toContainText('30 Jun 2026');
  await expect(rows(page).nth(3)).toContainText('First version');
});

test('the admin has Edit and Publish for a draft, View for published versions, and Copy for each', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByRole('link', { name: 'Edit v4' })).toHaveAttribute('href', '/flows/flow-timesheet/versions/4');
  await expect(page.getByRole('button', { name: 'Publish v4' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View v3' })).toHaveAttribute('href', '/flows/flow-timesheet/versions/3');
  await expect(page.getByRole('button', { name: 'Publish v3' })).toHaveCount(0);
  for (const n of [1, 2, 3, 4]) await expect(page.getByRole('button', { name: `Copy to new version v${n}` })).toBeVisible();
});

test('the date check names the version a run would use; a date no version covers says what happens', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Check which version a date uses' })).toBeVisible();
  const check = page.getByRole('status').filter({ hasText: /A run with effective date|No published|No version/ });
  await expect(check).toContainText(/uses v3\./);
  // From today (17 Nov 2026 in these tests' calendar) six months back, then two days: 15 May 2026.
  await pickDate(page, /^Date to check:/, ['PageUp', 'PageUp', 'PageUp', 'PageUp', 'PageUp', 'PageUp', 'ArrowLeft', 'ArrowLeft']);
  await expect(check).toHaveText('A run with effective date 15 May 2026 uses v2.');
  await pickDate(page, /^Date to check:/, ['PageUp', 'PageUp', 'PageUp', 'PageUp', 'PageUp']);
  await expect(check).toContainText('No published version covers');
  await expect(check).toContainText('stops with an error');
});

test('New version asks for a start day, refuses one inside an existing version, and creates a draft copy', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'New version', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New version from v4' });
  await expect(dialog.getByRole('button', { name: 'Create version' })).toBeEnabled();
  await pickDate(page, /^Valid from:/, ['PageUp', 'PageUp', 'PageUp', 'PageUp', 'PageUp', 'PageUp', 'ArrowLeft', 'ArrowLeft']);
  await expect(dialog.getByRole('alert')).toContainText('15 May 2026 is inside v2 (01 Apr 2026 to 30 Jun 2026). Choose a day after 30 Jun 2026.');
  await expect(dialog.getByRole('button', { name: 'Create version' })).toBeDisabled();
  await pickDate(page, /^Valid from:/, ['PageDown', 'PageDown', 'PageDown', 'PageDown', 'PageDown', 'PageDown']);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Create version' }).click();
  await expect(page).toHaveURL(/\/flows\/flow-timesheet\/versions\/5$/);
  await expect(page.getByRole('banner').getByText('Draft', { exact: true })).toBeVisible();
});

test('Copy to new version copies the chosen version', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Copy to new version v3' }).click();
  await expect(page.getByRole('dialog', { name: 'New version from v3' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Publish from the table: an unfinished draft is refused with what to fix', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Publish v4' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish v4?' });
  await expect(dialog).toContainText('Publishing v4 will end v3 on 31 Dec 2026');
  await dialog.getByRole('button', { name: 'Publish' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Fix it, then publish again');
});

test('Publish from the table: a finished draft is published, v3 ends the day before, and the timeline and table follow', async ({ page }) => {
  await seed(page, (s) => {
    const v4 = s.flows.find((f) => f.id === 'flow-timesheet')!.versions.find((v) => v.versionNo === 4)!;
    v4.definition = {
      schemaVersion: 1,
      nodes: [
        { id: 'in', type: 'input_file', settings: { key: 'file', headerRow: 1 } },
        { id: 'out', type: 'output', settings: { file: 'Result', format: 'xlsx', sheet: 'Sheet1' } },
      ],
      edges: [{ source: 'in', target: 'out' }],
    };
  });
  await page.goto(URL);
  await page.getByRole('button', { name: 'Publish v4' }).click();
  await page.getByRole('dialog', { name: 'Publish v4?' }).getByRole('button', { name: 'Publish' }).click();
  await expect(toastWith(page, 'v4 published.')).toBeVisible();
  await expect(rows(page).nth(1)).toContainText('31 Dec 2026');
  await expect(rows(page).nth(1)).toContainText('Published, in effect'); // it now ends on 31 Dec 2026; today is still inside it
  await expect(rows(page).nth(0)).toContainText('Published, starts later');
  await expect(page.getByRole('button', { name: 'Publish v4' })).toHaveCount(0);
  await expect(page.getByText('Versions cannot overlap. A new version starts after the one before it.')).toBeVisible();
});

test('a group member who is not the admin sees the versions but cannot create, copy or publish', async ({ page }) => {
  await seed(page, (s) => (s.currentUserId = 'user-lan'));
  await page.goto(URL);
  await expect(rows(page)).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'New version', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Copy to new version/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Publish v/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View v4' })).toBeVisible();
});

test('a flow that does not exist shows what failed', async ({ page }) => {
  await page.goto('/flows/flow-nothing/versions');
  await expect(page.getByRole('alert')).toContainText('The versions could not be loaded.');
});
