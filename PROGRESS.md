STATUS: IN PROGRESS

# Progress

Tick a task only after its tests pass and the change is committed. Tasks run in
order inside a phase. A later phase may start only when the gate of the phase
before it passes, except where a task says otherwise.

## Phase 0: Spike (gate G0)

- [x] T0.1 Scaffold the app (Vite, React, TypeScript strict, React Router, ESLint, Vitest, Playwright) and create every npm script named in `CLAUDE.md`. Scripts for later phases may fail with "not implemented" for now.
- [x] T0.2 Script that generates the six benchmark files of SPEC section 8 into a temporary folder (not committed).
- [x] T0.3a Benchmark page and worker: `/bench/` page, one module worker per run, SheetJS (whole-workbook) and DuckDB `read_csv` strategies, one group-by query, load and query time. Small-file Playwright spec (`npm run spike:smoke`).
- [x] T0.3b Spike runner behind `npm run spike`: generate files if missing, serve a production build, one fresh page per file, renderer memory sampled from Node (max RSS), tab-crash and timeout handling, raw results as JSON, files deleted in a `finally`. Exit 0 even when a run crashes.
- [x] T0.4a Streaming xlsx reader in `src/engine/xlsx-stream/`: zip directory, `DecompressionStream`, shared strings, styles (dates), first sheet, rows as an async generator. Unit tests compare it with SheetJS on small files.
- [ ] T0.4b Add the streaming reader as a third strategy in the bench worker, run `npm run spike`, and write `docs/SPIKE_RESULTS.md` (six measurements, strategies compared, chosen xlsx reading strategy) from `docs/spike-raw.json` with a script, so the file is regenerated on every run.
- [ ] T0.5 Implement the size guard: when a file is above the measured safe size, show the "save as csv" warning instead of loading.

## Phase 1: Engine (gates G1, G2)

- [ ] T1.1 Flow definition schema: TypeScript types, JSON schema, validation with clear errors (unknown node type, missing input, cycle).
- [ ] T1.2 Engine core: DuckDB-WASM worker, load input tables, topological order, one view per node, preview of 100 rows, cancel.
- [ ] T1.3 Input file node: sheet, header row, rows to skip, fill down merged cells, row number column, csv.
- [ ] T1.4 Column mapping node.
- [ ] T1.5 Filter node with a second output for the rows that do not match.
- [ ] T1.6 Formula parser: tokens, precedence, column references in square brackets, strings, numbers, function calls, error positions.
- [ ] T1.7 Formula functions, logic and math groups of Tier 1, each with unit tests.
- [ ] T1.8 Formula functions, text group of Tier 1, each with unit tests.
- [ ] T1.9 Formula functions, date group of Tier 1 and EFFECTIVE_DATE, each with unit tests.
- [ ] T1.10 Formula column node.
- [ ] T1.11 Lookup / Join node: from another node and from a reference table, behaviour when no match is found.
- [ ] T1.12 Group by node.
- [ ] T1.13 Unpivot node and Pivot node.
- [ ] T1.14 Append node and SQL node.
- [ ] T1.15 Output node: several sheets in one workbook, csv, date and number types preserved.
- [ ] T1.16 Effective date: resolve flow version and reference table versions, stop with a clear message when no version covers the date.
- [ ] T1.17 Acceptance harness: Playwright test that runs a flow file on a dataset folder and compares workbooks cell by cell. Prove it fails on a wrong workbook.
- [ ] T1.18 `flows/monthly-timesheet.flow.json`, part 1: reading, unpivot, dates, employment window, Exceptions sheet (rules R1 to R9).
- [ ] T1.19 `flows/monthly-timesheet.flow.json`, part 2: Summary sheet (R10) and OT_breaches sheet (R11), sort order (R12).
- [ ] T1.20 Both datasets pass `npm run test:acceptance`. Add the test that no network request carries file content.

## Phase 2: Canvas and screens (gates G3, G4)

- [ ] T2.1 Design tokens, global styles, font, and the UI-rules test skeleton.
- [ ] T2.2 Base components: Button, Badge, Card, Table, Field, Search field.
- [ ] T2.3 Dropdown and Date picker, with keyboard support and tests.
- [ ] T2.4 Checkbox, Tabs, Dialog, Toast, Skeleton, Empty state, Error state.
- [ ] T2.5 `/dev/components` route that matches screen 7.
- [ ] T2.6 `DataStore` interface, `LocalStore`, and seed data that matches the screens.
- [ ] T2.7 App shell: sidebar, page header, routing, strings module.
- [ ] T2.8 Flows screen: list, filters, search, delete with confirm, loading and empty states.
- [ ] T2.9 Builder, part 1: canvas with React Flow, step cards, add by drag from the step list, connect, select, delete, zoom controls.
- [ ] T2.10 Builder, part 2: settings panel shell with Setup, Configure and Test tabs, step preview table.
- [ ] T2.11 Settings forms: Input file, Column mapping (with paste from Excel), Filter.
- [ ] T2.12 Settings forms: Formula column with editor, function list, validation message.
- [ ] T2.13 Settings forms: Lookup / Join, Group by, Unpivot, Pivot.
- [ ] T2.14 Settings forms: Append, Output, SQL.
- [ ] T2.15 Builder, part 3: version dropdown, save draft, publish, read-only mode for published versions.
- [ ] T2.16 Run screen: effective date, resolved versions, file inputs, progress, result tabs, download, error state.
- [ ] T2.17 Versions screen: timeline, table, new version from copy, no-overlap check, date checker.
- [ ] T2.18 Reference tables screen: list, versions, grid with paste from Excel, read-only published versions.
- [ ] T2.19 Admin screen: users, groups, access to shared flows, deleted flows with restore.
- [ ] T2.20 End-to-end journeys for gate G3.
- [ ] T2.21 UI rules and accessibility tests for gate G4 on every route.

## Phase 3: Server (gate G5)

- [ ] T3.1 Supabase project folder, local start script, first migration with all tables of SPEC section 4.
- [ ] T3.2 Constraints: no overlapping versions per flow and per reference table, published versions read-only, at most 50,000 rows per reference table version.
- [ ] T3.3 Row-level security for flows, versions and group access, with tests for every cell of the permission table.
- [ ] T3.4 Row-level security for reference tables, profiles, groups and run log, with tests.
- [ ] T3.5 Soft delete, restore, and removal after 30 days.
- [ ] T3.6 `SupabaseStore` that implements `DataStore`, selected by environment variables.
- [ ] T3.7 Sign-in screen and session handling.
- [ ] T3.8 Keep-alive: a small scheduled request that touches the database once a day, as code plus instructions.
- [ ] T3.9 `docs/DEPLOY.md`: steps for a human to create the Supabase project, run migrations, set variables on Cloudflare Pages, and create the first admin.

## Needs Harold

Decisions with a default. Build with the default unless this list says otherwise.

| Topic | Default used by the build |
| --- | --- |
| OT type of a day | From the attendance code of the same employee on the same day (rule R9) |
| Week for the weekly OT limit | ISO week, only days of the run month (rule R11) |
| Hours equal to a limit | Not a breach (rule R11) |
| Formula language | Tier 1 only |
| Approval before a version takes effect | None |
| Reference tables by non-admin users | Not allowed |
| UI language | English |

## Blockers

None.

## Log

Newest first.

### 2026-11-17 T0.4a Streaming xlsx reader
Changed: src/engine/xlsx-stream/{errors,zip,parts,sheet,index}.ts and 12 tests (SheetJS as oracle on small workbooks and on a generated 2,001-row benchmark file; chunk sizes down to 1 character; special characters; dates; gaps; unknown sheet; not a zip). PROGRESS: T0.4 split into T0.4a and T0.4b.
How: reads the zip directory with small slices, inflates one part at a time with the browser's `DecompressionStream`, parses the sheet XML in chunks row by row, resolves shared strings and date styles. No new dependency.
Check: three deliberate mutations (no XML unescape, date styles ignored, no tail kept between chunks) each made tests fail, then were reverted. Node sanity run on the 1,048,576 x 40 xlsx that SheetJS could not open: all 1,048,576 rows read in 51.5 s, process RSS 384 MB, last row id 1048575. Browser numbers come in T0.4b.
Gates run: check PASS (34 unit tests).
Next: T0.4b.

### 2026-11-17 T0.3b Spike runner
Changed: scripts/spike.ts (`npm run spike`), scripts/lib/{spike-runner,proc-memory}.ts (+ 11 unit tests), vite.spike.config.ts, spike/crash-detection.spec.ts, docs/spike-raw.json (raw results of the full run).
How it works: generates missing files, builds and serves the bench page, one fresh Chromium per run, peak renderer memory from /proc VmHWM via CDP renderer pids, crash/error/timeout recorded as a status, files and build output deleted in a `finally`, exit 1 only when no run finished.
Full run, 9 runs, exit 0, about 5.5 min. SheetJS whole-sheet: xlsx 100k ok (16.9 s, 2.2 GB); xlsx 500k and 1M error "no sheet" after 11 s and 21 s (SheetJS returns no sheet, no exception, probably past the string limit; cause not yet confirmed); csv 100k ok (12.0 s, 2.0 GB); csv 500k ok (70.5 s, 9.3 GB); csv 1M ok (148 s, 10.2 GB). DuckDB read_csv: 100k 0.75 s / 379 MB; 500k 2.7 s / 672 MB; 1M 4.6 s / 1.1 GB. Group-by query 32 to 109 ms. No tab crash happened in the full run.
Gates run: check PASS (22 unit tests); spike PASS (exit 0, 9 runs); spike:smoke crash-detection spec PASS; forced `--timeout-min=0.01` run recorded 3 timeouts, cleaned up, exit 1 as designed.
Next: T0.4 (xlsx strategies for the large files; whole-workbook fails at 500k and 1M).

### 2026-11-17 T0.3a Benchmark page and worker (T0.3 split in two)
Changed: bench/index.html, src/spike/{columns.ts,bench-worker.ts,bench-page.ts,bench-types.ts}, 6 unit tests, spike/bench-small.spec.ts, playwright.spike.config.ts, `npm run spike:smoke`. Added deps: xlsx 0.20.3 (SheetJS CDN tarball, newest on the CDN), @duckdb/duckdb-wasm 1.33.1-dev57.0, apache-arrow 17.0.0.
Gates run: check PASS (13 unit tests); spike:smoke PASS (4 tests on a 2,000-row xlsx and csv, Chromium). The first smoke run failed once when Vite's dev optimizer reloaded the page; the rerun passed. T0.3b will measure a production build instead.
Next: T0.3b.

### 2026-11-17 T0.2 Benchmark file generator
Changed: scripts/generate-bench-files.ts, scripts/lib/bench-data.ts (+ 6 unit tests), vitest include for scripts/, `npm run bench:generate`, tsconfig allowImportingTsExtensions.
Result: six files written to git-ignored bench-data/ (xlsx: 28.6 / 143 / 300 MB; csv: 36 / 180 / 378 MB) in 61 s total, 40 columns, seeded, shared strings, one 200-value group key, one date column. 1M xlsx sheet XML is 1.49 GB uncompressed. Verified with zipfile.testzip, openpyxl (small file) and wc -l. Files deleted afterwards.
Gates run: check PASS (7 unit tests).
Next: T0.3.

### 2026-11-17 T0.1 Scaffold
Changed: package.json, .npmrc, tsconfig, vite/vitest/playwright/eslint configs, src/ skeleton, one unit test, one Playwright smoke spec, scripts/not-implemented.mjs, docs/DECISIONS.md.
Gates run: check PASS (1 unit test); Playwright smoke PASS (1 test, bundled Chromium); build PASS. spike, test:acceptance, test:e2e, test:ui-rules, test:db exit 1 as designed.
Next: T0.2.
