import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const open = async (page: Page) => {
  await page.goto('/dev/components');
  await expect(page.getByRole('heading', { name: 'Components and states', level: 1 })).toBeVisible();
};

test.describe('Dropdown', () => {
  test('opens with a click, moves with arrows, selects with Enter and returns focus', async ({ page }) => {
    await open(page);
    const trigger = page.getByRole('button', { name: /^Version: v3/ });
    await trigger.click();
    const list = page.getByRole('listbox', { name: 'Version' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('option', { name: /v3/ })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('option', { name: /v2/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(page.getByRole('button', { name: /^Version: v2/ })).toBeFocused();
  });
  test('Escape closes without changing the value; Home and End jump; type-ahead finds an option', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /^Version: v3/ }).click();
    await page.keyboard.press('End');
    await expect(page.getByRole('option', { name: /v1/ }).first()).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.type('v2');
    await expect(page.getByRole('listbox', { name: 'Version' }).getByRole('option', { name: /v2/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox', { name: 'Version' })).toBeHidden();
    await expect(page.getByRole('button', { name: /^Version: v3/ })).toBeFocused();
  });
  test('the selected option shows a check mark and aria-selected', async ({ page }) => {
    await open(page);
    const selected = page.getByRole('listbox', { name: 'Open version list' }).getByRole('option', { selected: true });
    await expect(selected).toHaveCount(1);
    await expect(selected.locator('svg')).toHaveCount(1);
  });
});

test.describe('Date picker', () => {
  test('shows 30 Sep 2026, opens on a Monday-first grid, moves by arrows and picks with Enter', async ({ page }) => {
    await open(page);
    const trigger = page.getByRole('button', { name: /^Effective date: 30 Sep 2026/ });
    await expect(trigger).toHaveText('30 Sep 2026');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Choose effective date' });
    await expect(dialog).toContainText('September 2026');
    await expect(dialog.getByRole('button', { name: '30 September 2026', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(dialog).toContainText('October 2026');
    await expect(dialog.getByRole('button', { name: '1 October 2026', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: /^Effective date: 1 Oct 2026/ })).toBeFocused();
  });
  test('previous and next month buttons and PageDown change the month; Escape closes and returns focus', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /^Effective date:/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose effective date' });
    await dialog.getByRole('button', { name: 'Next month' }).click();
    await expect(dialog).toContainText('October 2026');
    await dialog.getByRole('button', { name: 'Previous month' }).click();
    await dialog.getByRole('button', { name: '30 September 2026', exact: true }).focus();
    await page.keyboard.press('PageDown');
    await expect(dialog).toContainText('October 2026');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: /^Effective date:/ })).toBeFocused();
  });
  test('the first weekday column is Monday (1 September 2026 is a Tuesday)', async ({ page }) => {
    await open(page);
    const dialog = page.getByRole('dialog', { name: 'Choose open date picker' });
    const first = await dialog.getByRole('button', { name: '1 September 2026', exact: true }).boundingBox();
    const second = await dialog.getByRole('button', { name: '2 September 2026', exact: true }).boundingBox();
    const eighth = await dialog.getByRole('button', { name: '8 September 2026', exact: true }).boundingBox();
    expect(second!.x).toBeGreaterThan(first!.x);
    expect(Math.abs(eighth!.x - first!.x)).toBeLessThan(1); // a week later, same column
    // Monday column x: the "Mo" header is hidden from assistive technology, so compare with the first grid column.
    const grid = await dialog.locator('[class*="grid"]').boundingBox();
    expect(first!.x).toBeGreaterThan(grid!.x + grid!.width / 7 - 1); // the Tuesday column, not the first
  });
  test('opens upward when there is no room below', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 520 });
    await open(page);
    const trigger = page.getByRole('button', { name: /^Effective date:/ });
    await trigger.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 0));
    const box = await trigger.boundingBox();
    // Move the trigger near the bottom of the window, so the 330 px popover cannot fit below it.
    await page.evaluate((y) => window.scrollBy(0, y - (window.innerHeight - 80)), box!.y);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Choose effective date' });
    const d = await dialog.boundingBox();
    const t = await trigger.boundingBox();
    expect(d!.y + d!.height).toBeLessThanOrEqual(t!.y + 1);
  });
});

test.describe('Checkbox, tabs, dialog, toast', () => {
  test('Space toggles the checkbox', async ({ page }) => {
    await open(page);
    const box = page.getByRole('checkbox', { name: 'View and run' }).first();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).toHaveAttribute('aria-checked', 'false');
  });
  test('arrow keys move between tabs and select them', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Setup' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Configure' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Configure' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Test' })).toHaveAttribute('aria-selected', 'true');
  });
  test('the dialog traps focus, Escape closes it and focus returns to the opener', async ({ page }) => {
    await open(page);
    const opener = page.getByRole('button', { name: 'Delete flow' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Delete Monthly timesheet summary?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Delete flow' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Delete flow' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
  test('a toast appears in the live region and can be dismissed', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Show toast' }).click();
    const toast = page.getByRole('status').filter({ hasText: 'Draft saved' });
    await expect(toast).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss message' }).click();
    await expect(toast).toBeHidden();
  });
});

test('the skeleton region is aria-busy and the progress bar reports 7 of 12', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('status', { name: 'Loading flows' })).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '7');
});

test('a list that is taller than the window scrolls inside the window and every option can be reached', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 100 });
  await open(page);
  // The window is shorter than the list: open it with the keyboard, as the button may be under the page header.
  await page.getByRole('button', { name: /^Version: v3/ }).focus();
  await page.keyboard.press('Enter');
  const list = page.getByRole('listbox', { name: 'Version', exact: true });
  await expect(list).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished' || a.effect?.getTiming().iterations === Infinity));
  const box = await list.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, scrolls: el.scrollHeight > el.clientHeight, vh: window.innerHeight };
  });
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.vh);
  expect(box.scrolls).toBe(true);
  await page.keyboard.press('End');
  const last = list.getByRole('option').last();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
});
