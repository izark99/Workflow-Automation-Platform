import { expect, test } from '@playwright/test';

// T7.16b: the parts of Phases 4 and 6 in and around the settings panel (light theme values).
test('the version of the flow in the builder bar is a status badge with an icon and a word', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  const badge = page.locator('[class*="_bar_"]').first().locator('span').filter({ hasText: /^(Published|Draft)$/ }).first();
  await expect(badge).toBeVisible();
  expect(await badge.evaluate((el) => ({ icons: el.querySelectorAll('svg').length, h: el.getBoundingClientRect().height }))).toEqual({ icons: 1, h: 22 });
});

test('a bound field is a row: the chip is 40 px on primary-soft, and the link button stays level with the input box', async ({ page }) => {
  await page.goto('/dev/components');
  const bound = page.locator('[data-demo="pcBound"]');
  const chip = bound.locator('[class*="_chip_"]').first();
  await expect(chip).toBeVisible();
  const look = await chip.evaluate((el) => ({ h: el.getBoundingClientRect().height, bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, radius: getComputedStyle(el).borderTopLeftRadius }));
  expect(look).toEqual({ h: 40, bg: 'rgba(47, 111, 232, 0.14)', color: 'rgb(26, 86, 192)', radius: '14px' });
  const fixed = page.locator('[data-demo="pcFixed"]');
  const box = await fixed.getByRole('textbox').locator('..').boundingBox();
  const link = await fixed.locator('button[aria-haspopup="listbox"]').boundingBox();
  expect(link!.height).toBe(box!.height);
  expect(Math.abs(link!.y - box!.y)).toBeLessThanOrEqual(1); // level with the box (a fraction of a pixel from the page scroll)
});
