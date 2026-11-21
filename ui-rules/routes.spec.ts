import { expect, test } from '@playwright/test';
import { ROUTES } from './routes';
import { COMMON_RULES, headerPosition, settleAnimations, sidebarWidth } from './rules';

// The dark project must really run in the dark theme: otherwise a green run would prove nothing.
test('the app runs in the theme of the project, and the page colours differ between themes', async ({ page }, testInfo) => {
  const wanted = testInfo.project.use.colorScheme ?? 'light';
  await page.goto('/flows');
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(wanted);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe(wanted === 'dark' ? 'rgb(10, 17, 29)' : 'rgb(230, 237, 247)');
});

for (const route of ROUTES) {
  test.describe(`route ${route.name ?? route.path}`, () => {
    for (const [name, rule] of Object.entries(COMMON_RULES)) {
      test(name, async ({ page }) => {
        await route.before?.(page);
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');
        await route.prepare?.(page);
        await settleAnimations(page);
        expect(await rule(page)).toEqual([]);
      });
    }
    if (route.skeleton) {
      test('skeleton with aria-busy during a delayed load, same row heights as the table', async ({ page }) => {
        await route.before?.(page);
        await page.addInitScript(() => localStorage.setItem('dfw.loadDelayMs', '1500'));
        await page.goto(route.path);
        const busy = page.locator('[role="status"][aria-busy="true"]');
        await expect(busy).toBeVisible({ timeout: 1400 });
        const sk = await page.evaluate(() => {
          const box = document.querySelector('[role="status"][aria-busy="true"]')!;
          const parts = Array.from(box.children).map((c) => c.getBoundingClientRect().height);
          return { head: parts[0], rows: parts.slice(1) };
        });
        await page.locator('tbody tr').first().waitFor({ timeout: 10_000 });
        const real = await page.evaluate(() => ({
          head: document.querySelector('thead')!.getBoundingClientRect().height,
          row: document.querySelector('tbody tr')!.getBoundingClientRect().height,
        }));
        expect(sk.head).toBe(real.head);
        for (const h of sk.rows) expect(h).toBe(real.row);
      });
    }
    if (route.skeleton || route.busy) {
      test('the skeleton does not move with reduced motion', async ({ page }) => {
        await route.before?.(page);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.addInitScript(() => localStorage.setItem('dfw.loadDelayMs', '1500'));
        await page.goto(route.path);
        await page.locator('[role="status"][aria-busy="true"]').waitFor({ timeout: 1400 });
        const moving = await page.evaluate(() => [...document.querySelectorAll('[role="status"][aria-busy="true"] span')].filter((e) => getComputedStyle(e).animationName !== 'none').length);
        expect(moving).toBe(0);
      });
      test('no skeleton for a load that is faster than 300 ms', async ({ page }) => {
        await route.before?.(page);
        // The delay applies to each store call and a screen makes up to six, so 25 ms keeps the whole load well below the 300 ms
        // after which the skeleton may appear: it must never be drawn, so nothing flashes.
        await page.addInitScript(() => {
          localStorage.setItem('dfw.loadDelayMs', '25');
          (window as unknown as { __skeleton: number }).__skeleton = 0;
          new MutationObserver(() => {
            if (document.querySelector('[role="status"][aria-busy="true"]')) (window as unknown as { __skeleton: number }).__skeleton++;
          }).observe(document, { childList: true, subtree: true, attributes: true });
        });
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => (window as unknown as { __skeleton: number }).__skeleton)).toBe(0);
      });
    }
    if (route.sidebar && route.nav !== false) {
      test(route.railSidebar ? 'sidebar is 64 px wide' : 'sidebar is 232 px wide', async ({ page }) => {
        await route.before?.(page);
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');
        expect(await sidebarWidth(page, route.railSidebar ? 64 : 232)).toEqual([]);
      });
    }
    if (route.sidebar) {
      test('title and first block position', async ({ page }) => {
        await route.before?.(page);
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');
        expect(await headerPosition(page)).toEqual([]);
      });
    }
  });
}
