import { expect, test } from '@playwright/test';
import { ROUTES } from './routes';
import { COMMON_RULES, headerPosition } from './rules';

for (const route of ROUTES) {
  test.describe(`route ${route.name ?? route.path}`, () => {
    for (const [name, rule] of Object.entries(COMMON_RULES)) {
      test(name, async ({ page }) => {
        await route.before?.(page);
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');
        await route.prepare?.(page);
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
