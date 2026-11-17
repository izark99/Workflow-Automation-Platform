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

## D5 Benchmark files count the header row (T0.2)

"1,048,576 rows" is the Excel limit including the header, so the largest files hold the
header plus 1,048,575 data rows. The other sizes use the same rule. The generator is
seeded, writes shared strings like Excel, and runs as TypeScript with Node's built-in type
stripping (`node scripts/generate-bench-files.ts`), so it needs no extra dependency.

## D6 SheetJS from its own CDN (T0.3a)

`xlsx` is installed from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, the
official install path in the SheetJS docs. 0.20.3 is the newest release on that CDN
(0.20.4 and later return 404). The npm `xlsx` package is stale and is not used.

## D7 DuckDB-WASM bundles are self-hosted (T0.3a)

The worker selects the `mvp` or `eh` bundle through Vite `?url` imports, not
`getJsDelivrBundles()`. A run therefore loads only static assets from this app, which the
no-network test in T1.20 needs. These bundles need no COOP/COEP headers.
`@duckdb/duckdb-wasm` is pinned to 1.33.1-dev57.0 (the `latest` tag) and `apache-arrow`
to 17.0.0, the version it depends on.

## D8 Spike measures a production build (T0.3a)

On a cold start the Vite dev server re-optimizes dependencies and reloads the page, which
failed one smoke run. The spike runner (T0.3b) builds the app and serves it with
`vite preview`. This also removes dev transforms from the measurements.
