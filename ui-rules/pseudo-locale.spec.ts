import { expect, test } from '@playwright/test';
import { ROUTES } from './routes';
import { untranslatedText } from './rules';

// SPEC 11.3 / G4: with the pseudo-locale every visible text must be inside the markers. Its own test per route:
// wider text would break the width and height rules for reasons that have nothing to do with the texts.
//
// Scope grows with the migration (T4.7a2 -> T4.7c): the sidebar of every route with a sidebar, and the whole page of
// the sign-in screens. "sign-in screen with an error" waits for T4.7d (errors as codes: the stand-in auth service still
// returns English text); T4.7c ends with `body` on every route.
const scopeOf = (route: (typeof ROUTES)[number]): string | null => {
  if (route.pseudo === false) return null;
  if (route.path === '/flows' && !route.name && route.sidebar) return 'body'; // T4.7b1
  // T4.7b2: the builder, with a step selected and on the Test tab. The forms (Configure tab) follow in T4.7b3 and T4.7b4.
  if (route.path.endsWith('/versions/4') && (!route.name || route.name.includes('(Test tab)'))) return 'body';
  if (route.sidebar && route.nav !== false) return 'nav[aria-label="⟦Main⟧"]';
  if (route.name === 'sign-in screen' || route.name === 'sign-in screen after a session ended') return 'body';
  return null;
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
