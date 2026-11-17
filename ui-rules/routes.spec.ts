import { expect, test } from '@playwright/test';
import { ROUTES } from './routes';
import { COMMON_RULES, headerPosition } from './rules';

for (const route of ROUTES) {
  test.describe(`route ${route.path}`, () => {
    for (const [name, rule] of Object.entries(COMMON_RULES)) {
      test(name, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');
        expect(await rule(page)).toEqual([]);
      });
    }
    if (route.sidebar) {
      test('title and first block position', async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');
        expect(await headerPosition(page)).toEqual([]);
      });
    }
  });
}
