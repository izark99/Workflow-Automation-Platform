import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Gate G4 runs on every route. A route added to the app without an entry in ui-rules/routes.ts fails here.
const app = readFileSync('src/ui/app.tsx', 'utf8');
const listed = readFileSync('ui-rules/routes.ts', 'utf8');

const routePaths = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]!).filter((p) => p !== '*');
const rulePaths = [...listed.matchAll(/path: '([^']+)'/g)].map((m) => m[1]!.split('?')[0]!);
const pattern = (route: string): RegExp => new RegExp(`^${route.replace(/:[A-Za-z]+/g, '[^/]+')}$`);

describe('UI rules cover every route of the app', () => {
  it('finds the routes of the app', () => {
    expect(routePaths.length).toBeGreaterThanOrEqual(7);
    expect(routePaths).toContain('/flows/:id/versions/:versionNo');
  });
  for (const route of routePaths) {
    it(`${route} has at least one state in ui-rules/routes.ts`, () => {
      expect(rulePaths.some((p) => pattern(route).test(p)), `no entry for ${route}`).toBe(true);
    });
  }
  it('every sidebar screen is listed with the sidebar flag (title and first block at the same y)', () => {
    for (const route of ['/flows', '/reference-tables', '/admin', '/flows/:id/run', '/flows/:id/versions']) {
      const entries = [...listed.matchAll(/\{\s*path: '([^']+)',[^}]*?sidebar: (true|false)/gs)].filter((m) => pattern(route).test(m[1]!.split('?')[0]!));
      expect(entries.some((m) => m[2] === 'true'), `${route} needs an entry with sidebar: true`).toBe(true);
    }
  });
});
