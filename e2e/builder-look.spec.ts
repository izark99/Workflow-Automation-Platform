import { expect, test } from '@playwright/test';

// T7.15: the builder frame and the canvas on the Harold look (light theme values).
test('a step card is 240 x 56 px on surface-overlay with radius-md; the selected card has a 2 px primary-text ring and keeps its size', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  const card = page.locator('.react-flow__node').first();
  await expect(card).toBeVisible();
  const inner = card.locator('div').first();
  const look = await inner.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, border: cs.borderTopWidth };
  });
  expect(look.bg).toBe('rgba(255, 255, 255, 0.95)');
  expect(look.radius).toBe('14px');
  expect(look.border).toBe('1px');
  await card.click();
  const selected = await inner.evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, ring: getComputedStyle(el).boxShadow }));
  expect(selected.ring).toContain('rgb(26, 86, 192) 0px 0px 0px 2px');
  expect([selected.w, selected.h]).toEqual([look.w, look.h]);
});

test('the header bar is 64 px on surface-overlay; the step list and the settings panel are glass layers; the zoom controls are on surface-overlay', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  const header = await page.locator('[class*="_bar_"]').first().evaluate((el) => ({ h: el.getBoundingClientRect().height, bg: getComputedStyle(el).backgroundColor }));
  expect(header).toEqual({ h: 64, bg: 'rgba(255, 255, 255, 0.95)' });
  const layers = await page.evaluate(() =>
    ['builder-steps', 'builder-settings'].map((id) => {
      const glass = document.getElementById(id)!.querySelector('span[aria-hidden="true"]')!;
      const cs = getComputedStyle(glass);
      return { bg: cs.backgroundColor, blur: cs.backdropFilter, aside: getComputedStyle(document.getElementById(id)!).backdropFilter };
    }),
  );
  for (const l of layers) expect(l).toEqual({ bg: 'rgba(255, 255, 255, 0.72)', blur: 'blur(24px) saturate(1.5)', aside: 'none' });
  const toolbar = page.getByRole('toolbar');
  expect(await toolbar.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, blur: getComputedStyle(el).backdropFilter }))).toEqual({ bg: 'rgba(255, 255, 255, 0.95)', blur: 'none' });
});

test('the canvas is on the scene: it has no fill of its own (the dots, edges and handles are checked in canvas-theme)', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  const flow = await page.locator('.react-flow').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(flow).toBe('rgba(0, 0, 0, 0)');
});
