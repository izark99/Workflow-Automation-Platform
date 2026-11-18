import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

const seedWith = async (page: Page, change: (s: ReturnType<typeof seedSnapshot>) => void) => {
  const s = seedSnapshot();
  change(s);
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
};
const rows = (page: Page) => page.getByRole('table', { name: 'Flows' }).locator('tbody tr');

test('the list shows the flows of the screen with scope, owner, version in effect and range', async ({ page }) => {
  await page.goto('/flows');
  await expect(rows(page)).toHaveCount(4);
  const first = rows(page).first();
  await expect(first).toContainText('Monthly timesheet summary');
  await expect(first).toContainText('12 steps, 1 output sheet');
  await expect(first).toContainText('Shared');
  await expect(first).toContainText('HR Payroll, HR Analytics');
  await expect(first).toContainText('v3');
  await expect(first).toContainText('Published');
  await expect(first).toContainText('From 01 Jul 2026');
  const draft = rows(page).filter({ hasText: 'Insurance list merge' });
  await expect(draft).toContainText('Draft');
  await expect(draft).toContainText('Not published yet');
  await expect(draft.getByRole('link', { name: 'Run Insurance list merge' })).toHaveCount(0);
});

test('buttons in a row carry the name of the flow, and Open and Run are links to the right routes', async ({ page }) => {
  await page.goto('/flows');
  await expect(page.getByRole('link', { name: 'Open Monthly timesheet summary' })).toHaveAttribute('href', '/flows/flow-timesheet/versions/3');
  await expect(page.getByRole('link', { name: 'Run Monthly timesheet summary' })).toHaveAttribute('href', '/flows/flow-timesheet/run');
  await expect(page.getByRole('button', { name: 'Delete Monthly timesheet summary' })).toBeVisible();
});

test('scope chips and search narrow the list; no match shows an empty state that clears both', async ({ page }) => {
  await page.goto('/flows');
  const group = page.getByRole('group', { name: 'Filter flows by scope' });
  await group.getByRole('button', { name: 'Personal' }).click();
  await expect(group.getByRole('button', { name: 'Personal' })).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(2);
  await group.getByRole('button', { name: 'Shared' }).click();
  await expect(rows(page)).toHaveCount(2);
  await group.getByRole('button', { name: 'All flows' }).click();
  await page.getByRole('textbox', { name: 'Search flows' }).fill('ot by');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('OT by department');
  await group.getByRole('button', { name: 'Shared' }).click();
  await expect(page.getByText('No flow matches')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(page.getByRole('textbox', { name: 'Search flows' })).toHaveValue('');
});

test('delete asks for confirmation that names the flow and the 30 days; Cancel keeps it; Delete removes it and shows a toast', async ({ page }) => {
  await page.goto('/flows');
  const opener = page.getByRole('button', { name: 'Delete Insurance list merge' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Delete Insurance list merge?' });
  await expect(dialog).toContainText('1 version move to Deleted flows');
  await expect(dialog).toContainText('restore it within 30 days');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByRole('status').filter({ hasText: 'Insurance list merge deleted' })).toBeVisible();
});

test('a user sees only own personal flows and the shared flows of their groups, and cannot delete a shared flow', async ({ page }) => {
  await seedWith(page, (s) => (s.currentUserId = 'user-minh'));
  await page.goto('/flows');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Delete Insurance list merge' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete Monthly timesheet summary' })).toHaveCount(0);
  await expect(page.getByText('As admin you see every flow')).toHaveCount(0);
});

test('with no flows the empty state offers Create flow, which opens the same dialog', async ({ page }) => {
  await seedWith(page, (s) => (s.flows = []));
  await page.goto('/flows');
  await expect(page.getByText('No flows yet')).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Create flow' }).click();
  await expect(page.getByRole('dialog', { name: 'Create flow' })).toBeVisible();
});

test('a slow load shows the skeleton with aria-busy, then the table; a fast load shows no skeleton', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dfw.loadDelayMs', '1500'));
  await page.goto('/flows');
  await expect(page.getByRole('status', { name: 'Loading flows' })).toHaveAttribute('aria-busy', 'true');
  await expect(rows(page)).toHaveCount(4, { timeout: 10_000 });
  await expect(page.getByRole('status', { name: 'Loading flows' })).toHaveCount(0);
});

test('a data error is shown next to the table with what failed and what to do', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dfw.seed', '{broken'));
  await page.goto('/flows');
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toContainText('The data could not be loaded.');
  await expect(alert).toContainText('Reload the page');
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
});
