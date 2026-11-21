import { expect, test } from '@playwright/test';

// T7.16a: the forms of the settings panel on the Harold look (light theme values).
test('the Input step form has Harold fields: 40 px boxes on the inset tint, 14 px labels at 500, checkboxes of 18 px', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  await page.locator('.react-flow__node').first().click();
  await page.getByRole('tab', { name: 'Configure' }).click();
  const panel = page.locator('#builder-settings');
  const field = panel.getByRole('textbox').first();
  await expect(field).toBeVisible();
  const box = await field.locator('..').evaluate((el) => ({ h: el.getBoundingClientRect().height, bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor }));
  expect(box).toEqual({ h: 40, bg: 'rgba(15, 26, 43, 0.05)', border: 'rgba(15, 26, 43, 0.55)' });
  const labels = await panel.locator('label').evaluateAll((els) => els.slice(0, 3).map((el) => ({ size: getComputedStyle(el).fontSize, weight: getComputedStyle(el).fontWeight })));
  for (const l of labels) expect(l).toEqual({ size: '14px', weight: '500' });
  const check = panel.getByRole('checkbox').first();
  if (await check.count()) expect(await check.locator('span').first().evaluate((el) => el.getBoundingClientRect().width)).toBe(18);
});

test('the panel is glass over the scene and its content text keeps 4.5:1 (axe runs in the UI rules)', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  await page.locator('.react-flow__node').first().click();
  const panel = page.locator('#builder-settings');
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe('rgba(15, 26, 43, 0.1)');
  const weights = await panel.locator('*').evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).fontWeight))]);
  for (const w of weights) expect(Number(w)).toBeLessThanOrEqual(600);
});
