import { expect, test } from '@playwright/test';

test('the language switch changes the texts and the date form, is kept after a reload, and has no pseudo-locale', async ({ page }) => {
  await page.goto('/flows');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: /^Language/ }).click();
  await expect(page.getByRole('option')).toHaveText(['English', 'Tiếng Việt']);
  await page.getByRole('option', { name: 'Tiếng Việt' }).click();
  const vnav = page.getByRole('navigation', { name: 'Chính' });
  await expect(vnav.getByRole('link', { name: 'Bảng tham chiếu' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Luồng' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('vi');
  // dates keep the form "30 Thg 9 2026"; month names come from the catalog
  await page.goto('/reference-tables');
  await expect(page.getByText(/\d{1,2} Thg \d{1,2} \d{4}/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Chính' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Chính' }).getByRole('button', { name: /^Ngôn ngữ/ }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
});

test('the sign-in screen has the language switch too', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dfw.auth', JSON.stringify([{ email: 'a@example.test', password: 'a-long-password' }])));
  await page.goto('/flows');
  await page.getByRole('button', { name: /^Language/ }).click();
  await page.getByRole('option', { name: 'Tiếng Việt' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập', level: 1 })).toBeVisible();
});
