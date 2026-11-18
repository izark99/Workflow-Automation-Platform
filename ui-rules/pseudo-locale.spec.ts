import { expect, test } from '@playwright/test';
import { ROUTES } from './routes';
import { untranslatedText } from './rules';

// SPEC 11.3 / G4: with the pseudo-locale every visible text must be inside the markers. Its own test per route:
// wider text would break the width and height rules for reasons that have nothing to do with the texts.
//
// Scope: the whole page of every route. Left out until T4.7d: "sign-in screen with an error" (errors as codes: the
// stand-in auth service still returns English text) and the routes that opt out with `pseudo: false`.
const scopeOf = (route: (typeof ROUTES)[number]): string | null => {
  if (route.pseudo === false) return null;
  if (route.name === 'sign-in screen with an error') return null; // T4.7d
  return 'body'; // T4.7c3: every other route, whole page
};

for (const route of ROUTES) {
  const scope = scopeOf(route);
  if (!scope) continue;
  test(`pseudo-locale: ${route.name ?? route.path}`, async ({ page }) => {
    await route.before?.(page);
    await page.addInitScript(() => localStorage.setItem('dfw.locale', 'pseudo'));
    await page.goto(route.path);
    await page.waitForLoadState('networkidle');
    await route.prepare?.(page);
    expect(await untranslatedText(page, scope)).toEqual([]);
  });
}
