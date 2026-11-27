import { expect, test } from '@playwright/test';

// Fixes after Phase 7: the scroll bar that came and went with the info popover, the icon of the app, the sidebar that stretched
// with the page, and the Edit and View buttons of the Versions table.
for (const url of ['/flows', '/reference-tables', '/admin']) {
  test(`${url}: the page has no 1 px of extra height, so opening an info popover does not make a scroll bar come or go`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url);
    await expect(page.locator('button[data-infotip]').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // the data has loaded: the page has its final height
    const metrics = () => page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight, innerWidth: window.innerWidth }));
    const before = await metrics();
    // A page that is shorter than the window has no vertical overflow at all (admin is longer and always scrolls).
    if (url !== '/admin') expect(before.overflow).toBeLessThanOrEqual(0);
    await page.locator('button[data-infotip]').first().click();
    await expect(page.locator('button[data-infotip][aria-expanded="true"]').first()).toBeVisible();
    await page.waitForTimeout(300);
    const after = await metrics();
    expect(after.clientWidth).toBe(before.clientWidth);
    expect(after.overflow).toBe(before.overflow);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    expect(await metrics()).toEqual(before);
  });
}

test('the app has its icon: a favicon without a request, and the icon in the brand of the sidebar, the sign-in and the password screens', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/flows');
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toMatch(/^data:image\/svg\+xml,/);
  expect(requests.filter((u) => /favicon/.test(u))).toEqual([]);
  const brand = page.getByRole('navigation', { name: 'Main' }).locator('[class*="_brand_"]');
  await expect(brand.locator('svg')).toHaveCount(1);
  expect(await brand.locator('svg').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
});

test('the sidebar is as high as the window and fixed to it on a long page: Sign out and the footer stay in view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto('/admin');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();
  await expect(page.getByRole('table').first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(900);
  expect(Math.round((await nav.boundingBox())!.height)).toBe(700);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const box = (await nav.boundingBox())!;
  expect([Math.round(box.y), Math.round(box.height)]).toEqual([0, 700]);
  const lastControl = nav.getByRole('button').last();
  const b = (await lastControl.boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(700);
});

test('the Edit and View buttons of the Versions table have one width and the More menus start at one x', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions');
  const table = page.getByRole('table', { name: 'Versions' });
  await expect(table.locator('tbody tr').first()).toBeVisible();
  const cells = await table.locator('tbody tr').evaluateAll((rows) =>
    rows.map((r) => {
      const link = r.querySelector('td:last-child a')!.getBoundingClientRect();
      const more = r.querySelector('td:last-child button[aria-haspopup="listbox"]')!.getBoundingClientRect();
      return { linkX: Math.round(link.x), linkW: Math.round(link.width), moreX: Math.round(more.x), linkY: Math.round(link.y - r.getBoundingClientRect().y), moreY: Math.round(more.y - r.getBoundingClientRect().y) };
    }),
  );
  expect(new Set(cells.map((c) => c.linkW)).size).toBe(1);
  expect(new Set(cells.map((c) => c.linkX)).size).toBe(1);
  expect(new Set(cells.map((c) => c.moreX)).size).toBe(1);
  for (const c of cells) expect(c.linkY).toBe(c.moreY);
});

// A dialog is drawn inside main, and `.main > :not(header)` gave it a width, a margin and a padding: the scrim then covered only the middle of the window.
for (const url of ['/reference-tables', '/flows']) {
  test(`${url}: the scrim of a dialog covers the whole window`, async ({ page }) => {
    await page.setViewportSize({ width: 1832, height: 952 });
    await page.goto(url);
    await page.getByRole('button', { name: /^(New table|Create flow)$/ }).first().click();
    const layer = page.locator('[data-dialog-layer]');
    await expect(layer).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState === 'finished'));
    const box = await layer.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });
    expect(box).toEqual({ x: 0, y: 0, width: 1832, height: 952 });
  });
}

// A panel with a glass fill that scrolled its own content let the fill scroll away: the rest of the panel showed a hard edge.
// The panel itself does not scroll now; a scroller inside it does, over a fill that stays.
test('a panel keeps its glass fill whole while its content scrolls (sidebar, step list and settings panel)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 250 });
  await page.goto('/flows/flow-timesheet/versions/3');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.locator('.react-flow__node').first().click();
  await expect(page.getByRole('complementary', { name: 'Step settings' })).toBeVisible();
  for (const id of ['builder-settings', 'builder-steps']) {
    const result = await page.evaluate((panelId) => {
      const panel = document.getElementById(panelId)!;
      const fill = panel.querySelector(':scope > span[aria-hidden="true"]')!;
      const scroller = [...panel.children].find((c) => c instanceof HTMLElement && getComputedStyle(c).overflowY === 'auto') as HTMLElement;
      scroller.scrollTop = scroller.scrollHeight;
      const p = panel.getBoundingClientRect();
      const f = fill.getBoundingClientRect();
      return { scrolled: scroller.scrollTop, panelScrolls: panel.scrollHeight > panel.clientHeight + 1, top: Math.round(f.top - p.top), height: Math.round(f.height - p.height) };
    }, id);
    // The builder has a minimum height, so only the step list has more content than the panel can show at this window height.
    if (id === 'builder-steps') expect(result.scrolled, `${id} has content that scrolls at this height`).toBeGreaterThan(0);
    expect(result.panelScrolls, `${id} itself does not scroll`).toBe(false);
    expect(result.top).toBe(0);
    expect(result.height).toBe(0);
  }
  await page.goto('/flows');
  await expect(page.locator('#sidebar-body').getByRole('button', { name: /^Language/ })).toBeVisible();
  const side = await page.evaluate(() => {
    const panel = document.getElementById('sidebar-body')!;
    const fill = panel.querySelector(':scope > span[aria-hidden="true"]')!;
    const scroller = [...panel.children].find((c) => c instanceof HTMLElement && getComputedStyle(c).overflowY === 'auto') as HTMLElement;
    scroller.scrollTop = scroller.scrollHeight;
    const p = panel.getBoundingClientRect();
    const f = fill.getBoundingClientRect();
    return { scrolled: scroller.scrollTop, height: Math.round(f.height - p.height), top: Math.round(f.top - p.top) };
  });
  expect(side.scrolled).toBeGreaterThan(0);
  expect(side.top).toBe(0);
  expect(side.height).toBe(0);
});
