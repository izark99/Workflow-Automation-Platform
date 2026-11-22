import { expect, test } from '@playwright/test';

// T7.11: Flows and Versions on the Harold look (light theme values).
test('the version of a flow is a badge with an icon and a word: Published is success, Draft is the one use of Ember', async ({ page }) => {
  await page.goto('/flows');
  const published = page.getByRole('table').getByText('Published', { exact: true }).first();
  await expect(published).toBeVisible();
  const look = await published.evaluate((el) => ({ color: getComputedStyle(el).color, icons: el.querySelectorAll('svg').length, h: el.getBoundingClientRect().height }));
  expect(look).toEqual({ color: 'rgb(23, 104, 58)', icons: 1, h: 22 });
  const draft = page.getByRole('table').getByText('Draft', { exact: true }).first();
  if (await draft.count()) {
    expect(await draft.evaluate((el) => ({ color: getComputedStyle(el).color, icons: el.querySelectorAll('svg').length }))).toEqual({ color: 'rgb(158, 63, 12)', icons: 1 });
  }
});

test('the versions screen shows the state of each version as a badge with an icon, and the timeline uses the tokens', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions');
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  const badges = await table.locator('tbody tr td:nth-child(2) > span').evaluateAll((els) => els.map((el) => ({ text: el.textContent, icons: el.querySelectorAll('svg').length, color: getComputedStyle(el).color })));
  expect(badges.length).toBeGreaterThan(1);
  for (const b of badges) expect(b.icons).toBe(1);
  const states = Object.fromEntries(badges.map((b) => [b.text, b.color]));
  if ('In effect' in states) expect(states['In effect']).toBe('rgb(23, 104, 58)');
  if ('Draft' in states) expect(states['Draft']).toBe('rgb(158, 63, 12)');
  const segment = await page.locator('main [class*="segment"]').first().evaluate((el) => ({ radius: getComputedStyle(el).borderTopLeftRadius, h: el.getBoundingClientRect().height }));
  expect(segment).toEqual({ radius: '14px', h: 64 });
});
