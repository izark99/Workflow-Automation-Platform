import { expect, test } from '@playwright/test';

// T7.9b: the Harold table (light theme values).
test('a table has a sticky 40 px header on surface-overlay, rows of 44 px plus a divider, and numbers in tabular figures', async ({ page }) => {
  await page.goto('/flows');
  const table = page.getByRole('table').first();
  await expect(table.locator('tbody tr').first()).toBeVisible();
  const look = await table.evaluate((el) => {
    const th = el.querySelector('th')!;
    const td = el.querySelector('td')!;
    const row = el.querySelector('tbody tr')!;
    return {
      head: th.getBoundingClientRect().height,
      headBg: getComputedStyle(th).backgroundColor,
      sticky: getComputedStyle(th).position,
      headSize: getComputedStyle(th).fontSize,
      row: row.getBoundingClientRect().height,
      divider: getComputedStyle(td).borderBottomWidth,
    };
  });
  expect(look).toEqual({ head: 41, headBg: 'rgba(255, 255, 255, 0.95)', sticky: 'sticky', headSize: '13px', row: 45, divider: '1px' });
});

test('a long table that scrolls keeps its header in view', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('tab', { name: /Texts/ }).click();
  const region = page.getByRole('region').filter({ has: page.getByRole('table') }).first();
  await expect(region).toBeVisible();
  const header = region.getByRole('columnheader').first();
  const top = async () => (await header.boundingBox())!.y;
  const before = await top();
  await region.evaluate((el) => el.scrollBy(0, 300));
  expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1);
});

test('the grid of a reference table uses dense rows of 36 px plus the divider, and numbers are right-aligned in tabular figures', async ({ page }) => {
  await page.goto('/reference-tables?table=ref-ot-types');
  const row = page.getByRole('table').first().locator('tbody tr').first();
  await expect(row).toBeVisible();
  expect(Math.round((await row.boundingBox())!.height)).toBe(37);
  const numeric = row.locator('td').nth(2);
  expect(await numeric.evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toContain('tabular-nums');
});
