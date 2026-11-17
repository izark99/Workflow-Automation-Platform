# Decisions

Newest last.

## D1 Playwright uses the preinstalled Chromium (T0.1)

`@playwright/test` is pinned to 1.63.0, the version of the preinstalled `playwright`.
That version finds the bundled Chromium in `/opt/pw-browsers`, so no browser download
and no `playwright install` is needed. System Chrome is not used.

## D2 TypeScript 6.0.3, not 7 (T0.1)

`typescript-eslint` 8.73.0 accepts TypeScript `>=4.8.4 <6.1.0`. TypeScript 7 is the latest
release but would break lint, so the project pins 6.0.3. Revisit when typescript-eslint
supports 7.

## D3 Exact versions (T0.1)

`.npmrc` sets `save-exact=true` and `package-lock.json` is committed, so `npm ci` is
reproducible for `npm run gates`.

## D4 Gate scripts not built yet (T0.1)

`spike`, `test:acceptance`, `test:e2e`, `test:ui-rules` and `test:db` run
`scripts/not-implemented.mjs`, which exits 1 and names the task that replaces it.
`vitest` runs only `src/**/*.test.ts(x)`. Playwright specs live in `e2e/`.
