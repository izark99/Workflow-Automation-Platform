import { expect, test } from '@playwright/test';

// T7.8b: menus, popovers, info buttons and tooltips (light theme values). Escape closes the top layer only.
test('Escape closes the date picker first and the dialog after it', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions');
  await page.getByRole('button', { name: 'New version', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /^New version from/ });
  await dialog.getByRole('button', { name: /^Valid from:/ }).click();
  const calendar = page.getByRole('dialog', { name: /Choose/ });
  await expect(calendar).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(calendar).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Escape closes an info popover and nothing else, and a click opens it again', async ({ page }) => {
  await page.goto('/dev/components');
  const tip = page.locator('button[data-infotip]').first();
  await tip.click();
  await expect(tip).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(tip).toHaveAttribute('aria-expanded', 'false');
  await tip.click();
  await expect(tip).toHaveAttribute('aria-expanded', 'true');
});

test('the info popover is on surface-overlay with shadow-md and keeps the 24 px button and the polite live region', async ({ page }) => {
  await page.goto('/dev/components');
  const button = page.locator('button[data-infotip]').first();
  const box = (await button.boundingBox())!;
  expect([box.width, box.height]).toEqual([24, 24]);
  await button.click();
  const popover = page.locator('[role="status"][aria-live="polite"]').filter({ hasText: /\S/ }).first();
  await expect(popover).toBeVisible();
  const look = await popover.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow };
  });
  expect(look.bg).toBe('rgba(255, 255, 255, 0.95)');
  expect(look.radius).toBe('14px');
  expect(look.shadow).toContain('rgba(15, 26, 43, 0.14) 0px 12px 32px');
});

test('an icon button shows its tooltip at once on keyboard focus, and Escape hides it', async ({ page }) => {
  await page.goto('/dev/components');
  const icon = page.locator('button[data-tooltip]').first();
  const opacity = () => icon.evaluate((el) => getComputedStyle(el, '::after').opacity);
  await page.keyboard.press('Shift'); // the last input is the keyboard, so focus() is a keyboard focus
  await icon.focus();
  await expect(icon).toBeFocused();
  await expect.poll(opacity, { timeout: 1000 }).toBe('1');
  await page.keyboard.press('Escape');
  await expect.poll(opacity, { timeout: 1000 }).toBe('0');
  await expect(icon).toBeFocused();
  // Tabbing away and back shows it again.
  await icon.blur();
  await page.keyboard.press('Shift');
  await icon.focus();
  await expect.poll(opacity, { timeout: 1000 }).toBe('1');
});
