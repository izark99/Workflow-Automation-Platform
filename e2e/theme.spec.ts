import { expect, test } from '@playwright/test';

const themeOf = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const bgOf = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('System follows the operating system live', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/flows');
  expect(await themeOf(page)).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => themeOf(page)).toBe('dark');
});

test('the switch in the sidebar sets Light or Dark, keeps it after a reload, and ignores the operating system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/flows');
  expect(await themeOf(page)).toBe('dark');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: /^Theme/ }).click();
  await page.getByRole('option', { name: 'Light' }).click();
  await expect.poll(() => themeOf(page)).toBe('light');
  await page.reload();
  expect(await themeOf(page)).toBe('light');
  await nav.getByRole('button', { name: /^Theme/ }).click();
  await page.getByRole('option', { name: 'Dark' }).click();
  await expect.poll(() => themeOf(page)).toBe('dark');
});

test('no flash: the theme is set before the first paint on reload', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dfw.theme', 'dark'));
  await page.emulateMedia({ colorScheme: 'light' });
  // Record the theme at the first moment the DOM has a body, which is before the app code has run.
  await page.addInitScript(() => {
    const record = (): void => {
      (window as unknown as { __firstTheme?: string }).__firstTheme ??= document.documentElement.getAttribute('data-theme') ?? 'none';
    };
    new MutationObserver((_, o) => {
      if (document.body) {
        record();
        o.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/flows');
  expect(await page.evaluate(() => (window as unknown as { __firstTheme?: string }).__firstTheme)).toBe('dark');
  expect(await bgOf(page)).not.toBe('rgb(240, 253, 250)');
});
