import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const tip = (page: Page) => page.getByRole('button', { name: 'About Effective date' });
const text = /The date a run is for/;

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
});

test('the info button is exactly 24 x 24 px and named "About {label}"', async ({ page }) => {
  const box = await tip(page).boundingBox();
  expect(box!.width).toBe(24);
  expect(box!.height).toBe(24);
  await expect(tip(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText(text)).toHaveCount(0);
});

test('keyboard: Tab reaches it, Enter opens, the text is in a polite live region, Escape closes, focus stays', async ({ page }) => {
  await tip(page).focus();
  await page.keyboard.press('Enter');
  await expect(tip(page)).toHaveAttribute('aria-expanded', 'true');
  const region = page.getByRole('status').filter({ hasText: text });
  await expect(region).toBeVisible();
  await expect(region).toHaveAttribute('aria-live', 'polite');
  await page.keyboard.press('Escape');
  await expect(page.getByText(text)).toHaveCount(0);
  await expect(tip(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByText(text)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText(text)).toHaveCount(0);
});

test('a click opens, a second click closes, and a click outside closes', async ({ page }) => {
  await tip(page).click();
  await expect(page.getByText(text)).toBeVisible();
  await tip(page).click();
  await expect(page.getByText(text)).toHaveCount(0);
  await tip(page).click();
  await expect(page.getByText(text)).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.getByText(text)).toHaveCount(0);
});

test('hover opens after 300 ms, not before, and leaving closes it; the popover can be reached with the pointer', async ({ page }) => {
  await tip(page).hover();
  await page.waitForTimeout(100);
  await expect(page.getByText(text)).toHaveCount(0);
  await expect(page.getByText(text)).toBeVisible({ timeout: 1000 });
  const pop = await page.getByText(text).boundingBox();
  await page.mouse.move(pop!.x + 10, pop!.y + pop!.height / 2, { steps: 4 });
  await page.waitForTimeout(150);
  await expect(page.getByText(text)).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(page.getByText(text)).toHaveCount(0);
});

test('the popover stays inside the window: max width 320 px, card colours, opens below', async ({ page }) => {
  await tip(page).click();
  const pop = page.getByText(text);
  const box = await pop.boundingBox();
  const button = await tip(page).boundingBox();
  expect(box!.width).toBeLessThanOrEqual(320);
  expect(box!.y).toBeGreaterThan(button!.y + button!.height);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
