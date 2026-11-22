import { expect, test } from '@playwright/test';

// T7.14: the Admin screen on the Harold look (light theme values).
test('a status in the Users table is a badge with an icon and a word: Active is success, Locked is danger', async ({ page }) => {
  await page.goto('/admin');
  const table = page.getByRole('table', { name: /users/i }).first();
  await expect(table).toBeVisible();
  const badges = await table.locator('tbody td span').evaluateAll((els) =>
    els
      .filter((el) => ['Active', 'Locked', 'Must change password'].includes((el.textContent ?? '').trim()))
      .map((el) => ({ text: (el.textContent ?? '').trim(), icons: el.querySelectorAll('svg').length, color: getComputedStyle(el).color })),
  );
  expect(badges.length).toBeGreaterThan(0);
  for (const b of badges) expect(b.icons, b.text).toBe(1);
  const colours: Record<string, string> = { Active: 'rgb(23, 104, 58)', Locked: 'rgb(179, 38, 30)', 'Must change password': 'rgb(122, 79, 0)' };
  for (const b of badges) expect(b.color, b.text).toBe(colours[b.text]);
});

test('the tabs of Admin have the underline, and the cards are glass', async ({ page }) => {
  await page.goto('/admin');
  const tab = page.getByRole('tab', { selected: true }).first();
  await expect(tab).toBeVisible();
  expect(await tab.evaluate((el) => ({ color: getComputedStyle(el).color, h: getComputedStyle(el, '::after').height }))).toEqual({ color: 'rgb(26, 86, 192)', h: '2px' });
  const card = page.locator('section').first();
  expect(await card.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('blur(24px) saturate(1.5)');
});
