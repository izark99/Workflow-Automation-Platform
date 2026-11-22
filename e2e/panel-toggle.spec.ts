import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
});

test('the toggle works with Tab, Space and Enter and keeps the focus', async ({ page }) => {
  const rail = page.locator('[data-demo-rail="demo-rail-open"]');
  const toggle = rail.getByRole('button', { name: 'Collapse step list' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect((await toggle.boundingBox())?.width).toBe(32);
  expect((await toggle.boundingBox())?.height).toBe(32);
  await toggle.focus();
  await page.keyboard.press('Space');
  const expand = rail.getByRole('button', { name: 'Expand step list' });
  await expect(expand).toBeFocused();
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await rail.boundingBox())?.width).toBe(48);
  await page.keyboard.press('Enter');
  await expect(rail.getByRole('button', { name: 'Collapse step list' })).toBeFocused();
  await expect.poll(async () => (await rail.boundingBox())?.width).toBe(184);
});

test('the width changes in at most 200 ms, and at once with reduced motion', async ({ page }) => {
  const rail = page.locator('[data-demo-rail="demo-rail-open"]');
  const ms = async () => rail.evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(await ms()).toBe('0.2s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await ms()).toBe('0s');
});
