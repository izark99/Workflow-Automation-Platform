import { expect, test } from '@playwright/test';

test('the root opens the Flows screen inside the app shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/flows$/);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible();
});
