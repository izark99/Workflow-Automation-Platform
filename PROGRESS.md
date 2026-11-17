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
- [x] T0.4b Add the streaming reader as a third strategy in the bench worker, run `npm run spike`, and write `docs/SPIKE_RESULTS.md` (six measurements, strategies compared, chosen xlsx reading strategy) from `docs/spike-raw.json` with a script, so the file is regenerated on every run.
- [x] T0.5 Implement the size guard: when a file is above the measured safe size, show the "save as csv" warning instead of loading.

## Phase 1: Engine (gates G1, G2)

- [x] T1.1 Flow definition schema: TypeScript types, JSON schema, validation with clear errors (unknown node type, missing input, cycle).
- [x] T1.2 Engine core: DuckDB-WASM worker, load input tables, topological order, one view per node, preview of 100 rows, cancel.
- [x] T1.3 Input file node: sheet, header row, rows to skip, fill down merged cells, row number column, csv. Call `checkFileSize` (`src/engine/size-guard.ts`) before reading and surface `strings.xlsxTooLarge`; read xlsx with `src/engine/xlsx-stream/` and csv with DuckDB `read_csv` (decisions D9, D10).
- [x] T1.4 Column mapping node.
- [x] T1.5 Filter node with a second output for the rows that do not match. Depends on T1.6b (the condition is a formula); do it after T1.6b.
- [x] T1.6a Formula parser: tokens, Excel precedence, column references in square brackets, strings, numbers, function calls, error positions (no SQL yet).
- [x] T1.6b Formula compiler core: typed AST to DuckDB SQL for literals, column references, operators and blank rules, plus a function registry with arity and argument types.
- [x] T1.7 Formula functions, logic and math groups of Tier 1, each with unit tests.
- [x] T1.8 Formula functions, text group of Tier 1, each with unit tests.
- [x] T1.9 Formula functions, date group of Tier 1 and EFFECTIVE_DATE, each with unit tests.
- [x] T1.10 Formula column node.
- [x] T1.11 Lookup / Join node: from another node and from a reference table, behaviour when no match is found.
- [x] T1.12 Group by node.
- [x] T1.13a Unpivot node.
- [x] T1.13b Pivot node, with a column list taken from a reference table, a fill value and a name suffix (D13), so zero-count columns appear in reference-table order.
- [x] T1.14 Append node and SQL node.
- [x] T1.15a Output node: sort (columns or a formula), column list, several Output steps per workbook, consistency checks.
- [x] T1.15b File writer: workbook with several sheets and csv from the Output steps; date, number and boolean cells typed, blank cells absent, `numberLikeText` columns, UTC-safe dates.
- [x] T1.16 Effective date: resolve flow version and reference table versions, stop with a clear message when no version covers the date.
- [x] T1.17 Acceptance harness: Playwright test that runs a flow file on a dataset folder and compares workbooks cell by cell. Prove it fails on a wrong workbook.
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
- [ ] T2.16 Run screen: effective date, resolved versions, file inputs, progress, result tabs, download, error state. A file above the size limit shows `strings.xlsxTooLarge` instead of starting a run; the e2e test uses a sparse file just over `MAX_SAFE_XLSX_BYTES`, as `checkGuard` in `scripts/spike.ts` does.
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

### 2026-11-17 T1.17 Acceptance harness
Changed: scripts/lib/compare-workbooks.ts (+ 19 unit tests), acceptance/{index.html,page.ts,helpers.ts,datasets.ts,harness.spec.ts,timesheet.spec.ts}, vite.acceptance.config.ts, playwright.acceptance.config.ts, `npm run test:acceptance`, tsconfig, .gitignore, docs/DECISIONS.md (D30).
First browser run of the engine: `createBrowserRunner` (DuckDB-WASM in a Web Worker), the xlsx input path, version resolution, the Output node and the file writer all ran in Chromium at UTC+7. A pass-through flow gave a workbook equal to its input, and seven kinds of damage were each found (changed text, renamed header, missing row, date moved a day, date as number, filled cell, renamed sheet).
First-run problems: a TypeScript typing slip in the page, and the browser names UTC+7 `Asia/Saigon`, so the zone check tests the offset.
Not yet exercised in a browser: the csv path of the input node (`registerFileHandle`). T1.18 and T1.19 use xlsx inputs only; this stays open for T1.20 or the run screen.
Gates run: check PASS (380 unit tests). test:acceptance FAIL (2 passed: harness; 2 failed: the timesheet specs, because flows/monthly-timesheet.flow.json does not exist yet; expected at this stage).
Next: T1.18 (flow file part 1: reading, unpivot, dates, employment window, Exceptions sheet, rules R1 to R9).

### 2026-11-17 T1.16 Effective date and version resolution
Changed: src/engine/versions.ts (`resolveVersion`, `prepareRun`, `findOverlaps`, `referencedTables`, `isIsoDate`, `formatDate`), versions.test.ts (15 tests), error codes `no_version` and `invalid_versions`, docs/DECISIONS.md (D29).
How: inclusive ranges, open end, one match or a clear stop that lists the existing periods in `30 Sep 2026` form; drafts ignored; overlap and bad dates reported; `prepareRun` picks the flow version and the versions of the reference tables the flow reads. One test runs the same flow and data on two dates and gets two different limits from two table versions.
Gates run: check PASS (361 unit tests).
Next: T1.17 (acceptance harness: Playwright test that runs a flow file on a dataset folder and compares workbooks cell by cell; prove it fails on a wrong workbook).

### 2026-11-17 T1.15b File writer
Changed: src/engine/output/export.ts (`buildOutputFiles`), export.test.ts (11 tests that read the files back with SheetJS), docs/DECISIONS.md (D28).
How: one workbook per file name with the sheets in step order, or a csv; typed cells (number, date serial with `yyyy-mm-dd` built in UTC, boolean, text), blank cells absent, `numberLikeText` columns, all rows (250-row test), csv with BOM, quoting and ISO dates. A read-back with `cellDates` gives the right date in any time zone.
Two first-run problems, both mine: a literal byte order mark character slipped into the source (lint caught it; now written as an escape), and a test decoded the csv with `TextDecoder`, which drops the BOM; the test now checks the three bytes.
Gates run: check PASS (346 unit tests).
Next: T1.16 (effective date: resolve flow and reference table versions).

### 2026-11-17 T1.15a Output node (T1.15 split into T1.15a and T1.15b)
Changed: src/engine/nodes/output.ts, output.test.ts (13 tests), run.ts (stores every handle a node returns, `checkOutputNodes` at the start, `RunResult.rows()`), registry, docs/DECISIONS.md (D27 incl. the answer to D18).
Orientation first: dumped Exceptions and OT_breaches of both expected workbooks. Dates are numeric serials with format yyyy-mm-dd, blank cells are absent, `Exceptions.value` mixes text, numbers and `2h`, `period` is text. These drive the settings.
How: sort by columns or by a formula (blanks last, ties in input order), `columns` to pick and order, sheet name rules, one format per file, unique sheet names, one csv step per file.
Two first-run problems: a TypeScript inference slip, and a test that guessed which sheet name the error mentions; the message now names both sheets.
Gates run: check PASS (335 unit tests).
Next: T1.15b (the file writer).

### 2026-11-17 T1.14 Append and SQL nodes
Changed: src/engine/nodes/{append,sql-node}.ts, append.test.ts (7 tests), sql-node.test.ts (11 tests incl. the safety check), registry, docs/DECISIONS.md (D26).
Append: by name (default, blanks for missing columns) or by position; type and case clashes refused; row order of every input kept.
SQL node: one read-only SELECT/WITH query on in1, in2, ...; result types mapped to the engine's four types (numbers cast to DOUBLE); safety check blocks write/attach/copy statements, file and address readers and dynamic SQL (best effort, limits in D26).
Two first-run failures: my test regex for an Append message, and duplicate result columns that DuckDB hides when the query is wrapped (renamed to `a_1`); the query now runs at top level so DESCRIBE sees the real names.
Gates run: check PASS (322 unit tests).
Next: T1.15 (output node). First settle D18: mixed text and number cells in an output column.

### 2026-11-17 T1.13b Pivot node
Changed: src/engine/nodes/pivot.ts, pivot.test.ts (13 tests), `NodeModule.compile` may be async and gets `query(sql)` in its context (engine awaits it), registry, docs/DECISIONS.md (D25).
How: row keys, column source, value, aggregation; the new columns come from the data (sorted) or from a reference table (its order, zero columns kept, data values outside the list ignored); name prefix, suffix and case; fill value; guards for 500 columns, name clashes and wrong types.
Found while checking the expected `Summary`: its day-category columns are not in reference-table order (holiday before rest), so the flow ends with a Column mapping step that sets the order and final names (D25).
Gates run: check PASS (304 unit tests). I replaced one vacuous assertion of mine (name clash with a key) by a real case before committing.
Next: T1.14 (append and SQL nodes).

### 2026-11-17 T1.13a Unpivot node (T1.13 split into T1.13a and T1.13b)
Changed: src/engine/nodes/unpivot.ts, unpivot.test.ts (8 tests), registry, test helper option `limit`, docs/DECISIONS.md (D24). PROGRESS: T1.13 split into Unpivot and Pivot (one concern each).
How: keep and unpivot lists, name and value columns, optional `skipBlank`; row-major order guaranteed by an explicit sort; the value column is always text through the shared formatter, so the types do not change with the data (tested with an all-blank dataset); 31 columns x 20 rows checked.
First failure was my test reading only the 100 preview rows; fixed with a `limit` option in the helper, no change to the node.
Gates run: check PASS (291 unit tests).
Next: T1.13b (pivot node).

### 2026-11-17 T1.12 Group by node
Changed: src/engine/nodes/group-by.ts, group-by.test.ts (10 tests), registry, docs/DECISIONS.md (D23).
How: group columns plus sum, count, min, max, average; blanks ignored, sum of blanks is 0, blank key is one group, result sorted by the group columns; type rules and name clashes (also by case) refused with the step id.
Gates run: check PASS (283 unit tests).
Next: T1.13 (unpivot and pivot nodes). Decide D18 (mixed text and number cells) before T1.15; pivot needs a column list from a reference table (D13).

### 2026-11-17 T1.11 Lookup / Join node
Changed: src/engine/nodes/lookup-join.ts, lookup-join.test.ts (17 tests), registry, docs/DECISIONS.md (D22).
How: left join from a reference table or from the `right` input; one or more key pairs; brought columns with optional new names and kept types; no-match behaviour `blank`, `drop` or `fail` (message names the key value). Left order kept; the first row wins on repeated keys; text keys ignore case; blank keys never match; mistakes on names, key types and sources reported with the step id.
Probed first: DuckDB `error()` exists and is lazy inside CASE; `rowid` gives table order.
Gates run: check PASS (273 unit tests). A first compile error was a string-building slip in the fail message; fixed with `quoteString`.
Next: T1.12 (group by node).

### 2026-11-17 T1.10 Formula column node
Changed: src/engine/nodes/formula-column.ts, formula-column.test.ts (10 tests), registry.
How: settings `name` and `expression`. A new name adds a column at the end; the same exact name replaces that column in place and takes the new type; a name that differs only by case is refused (D14). Chained formula columns work. The effective date of the run reaches EFFECTIVE_DATE (tested with September and October). Formula mistakes name the step, the setting and the character.
Gates run: check PASS (256 unit tests).
Next: T1.11 (lookup / join node).

### 2026-11-17 T1.9 Formula functions: date group and EFFECTIVE_DATE
Changed: src/engine/formula/tier1/date.ts (DATE YEAR MONTH DAY WEEKDAY WEEKNUM ISOWEEKNUM EOMONTH EDATE DATEDIF DAYS EFFECTIVE_DATE), date.test.ts (23 tests, Excel results checked by hand, e.g. WEEKNUM and ISO week of the week-limit case), coverage.test.ts (registry equals the Tier 1 list of the spec; every function is called in a unit test), hint for text given to a date argument, docs/DECISIONS.md (D21).
All 48 Tier 1 functions plus EFFECTIVE_DATE are now registered.
Gates run: check PASS (246 unit tests).
Next: T1.10 (formula column node).

### 2026-11-17 T1.8 Formula functions: text group
Changed: src/engine/formula/tier1/text.ts (LEFT RIGHT MID LEN TRIM UPPER LOWER PROPER CONCAT TEXTJOIN SUBSTITUTE REPLACE FIND SEARCH TEXT VALUE), text.test.ts (20 tests on real DuckDB), `toText` moved to ops.ts, `roundSql` shared with TEXT, argument hint to use TEXT() for a number given as text, docs/DECISIONS.md (D20).
Probed DuckDB before writing: PROPER via a correlated subquery, SEARCH wildcards via regular expressions, `format()` for TEXT, list slices for SUBSTITUTE with an instance number.
Gates run: check PASS (221 unit tests). One first-run failure: the error for a number given to a text argument lacked the TEXT() hint; fixed.
Next: T1.9 (date functions and EFFECTIVE_DATE).

### 2026-11-17 T1.7 Formula functions: logic and math
Changed: src/engine/formula/tier1/{helpers,logic,math,index}.ts, ops.ts (blank rule and equality shared), test-helpers.ts, logic.test.ts (28 assertions groups, 9 describe blocks incl. IF IFS AND OR NOT IFERROR SWITCH ISBLANK ISNUMBER) and math.test.ts (ROUND ROUNDUP ROUNDDOWN INT ABS MOD MIN MAX SUM CEILING FLOOR POWER SQRT), `ctx.raw`, docs/DECISIONS.md (D19). One compile test changed from `ABS(1)` to `VLOOKUP(1)` as the example of an unsupported function, since ABS now exists.
Checked first on DuckDB: its `round` differs from Excel (0.285, 1.005), so ROUND* use the 15-digit decimal value; Excel results asserted in tests: ROUND(2.675,2)=2.68, MOD(-3,2)=1, INT(-1.5)=-2, FLOOR(-2.5,2)=-4 and others listed in D19.
Gates run: check PASS (201 unit tests).
Next: T1.8 (text functions).

### 2026-11-17 T1.5 Filter node
Changed: src/engine/nodes/filter.ts, src/engine/formula/node-formula.ts (`compileStepFormula`: formula mistakes become `EngineError` `invalid_formula` with step id and character), error code `invalid_formula`, filter.test.ts (9 tests), registry.
How: setting `condition` (a formula). `match` is `cond IS TRUE`, `nomatch` is `cond IS NOT TRUE`, so a blank condition lands in nomatch and the two outputs always add up to the input; input order and columns kept. A non-boolean condition is refused with a hint.
Note: no Tier 1 function exists yet, so the tests use operators only; function conditions are covered when T1.7 to T1.9 land.
Gates run: check PASS (166 unit tests).
Next: T1.7 (logic and math functions).

### 2026-11-17 T1.6b Formula compiler core
Changed: src/engine/formula/{compile,functions}.ts, compile.test.ts (19 tests, SQL run on real DuckDB), `numberToTextSql` in sql.ts (shared with Column mapping).
How: `compileFormula(source, {columns, effectiveDate}, registry)` returns `{sql, type}`. Typed literals (DOUBLE), exact-case column references, arithmetic with blank-cell-is-0 (bare references only), `/` and `^` give a blank instead of an error, `&` via `concat` with one number-to-text helper, text comparison ignoring case, date +/- days and date - date, type errors with positions. Function registry with arity checks and `ctx.arg(i, type)` for T1.7 to T1.9; the default registry is empty, so every call is "not supported" for now.
Bug caught by a test: in `&` a blank number gave `0x`; it now gives `x`.
Gates run: check PASS (157 unit tests).
Next: T1.5 (filter node, now that formulas compile).

### 2026-11-17 T1.6a Formula parser (T1.6 split, T1.5 moved after T1.6b)
Changed: src/engine/formula/{ast,parse}.ts, parse.test.ts (19 tests), docs/DECISIONS.md (D17 formula typing, blanks and errors; D18 open point on mixed text and number output cells). PROGRESS: T1.6 split into T1.6a and T1.6b; T1.5 now waits for T1.6b because a Filter condition is a formula.
How: lexer and recursive-descent parser with Excel precedence (`-2^2 = 4`, `2^3^2 = 64`, `&` below `+`, comparison lowest), column references with `]]` escape, `""` in text, source offsets on every node, `FormulaError` with position and length, depth limit 100.
Advisor consulted before the parser design (formula parser is a hard-to-undo design); its points are recorded in D17 and D18.
Gates run: check PASS (138 unit tests).
Next: T1.6b (typed compiler core and function registry).

### 2026-11-17 T1.4 Column mapping node
Changed: src/engine/nodes/{column-mapping,test-helpers}.ts, registry, 10 tests, docs/DECISIONS.md (D16).
How: grid rows keep/drop, rename, retype; unlisted columns stay; strict conversions with a clear failure; case-only name clashes refused. Paste from Excel is a UI task (T2.11).
Gates run: check PASS (119 unit tests).
Next: T1.5 (filter node with second output).

### 2026-11-17 T1.3 Input file node
Changed: src/engine/input/load.ts (+ 18 tests), src/engine/nodes/input-file.ts, registry, `runFlow` option `files`, `SqlRunner.registerFile` (Node and browser runners), sql.ts insert helpers, error codes, docs/DECISIONS.md (D15). One T1.2 test got a `key` on its input step, because an input step without a key is now rejected.
How: xlsx streamed with `src/engine/xlsx-stream/`, csv through `read_csv`; sheet, header row, skip rows, fill down, row number column; size guard called first and `strings.xlsxTooLarge` surfaced as `file_too_large`.
Not tested: the browser runner path for csv (`registerFileHandle`), and throughput on very large files (see D15). Both wait for T1.17 and T2.16.
Gates run: check PASS (109 unit tests).
Next: T1.4 (column mapping node).

### 2026-11-17 T1.2 Engine core
Changed: src/engine/{types,sql,run}.ts, nodes/{types,registry,columns}.ts, runner/{node-runner,browser-runner}.ts, tests (run.test.ts 9, columns.test.ts 3), docs/DECISIONS.md (D14).
How: `runFlow(runner, options)` validates the flow, loads input and reference tables, runs nodes in topological order, stores every node output as a table, returns `tables`, `preview` (100 rows, typed cells) and `dispose`. Abort signal and per-step progress. Node modules are sync (settings + input columns in, SELECT + columns out); the registry is empty until the node tasks add modules, so the unit tests use test-only modules.
Checked: DuckDB-WASM runs in Vitest through its Node blocking build; quoted identifiers are case-insensitive in DuckDB, so `requireColumn` enforces exact names (D14).
Not tested yet: `createBrowserRunner` (Web Worker) compiles and lints but no browser test runs it. It gets its first browser run in T1.17. The Node runner cannot cancel a running query, only between steps.
Gates run: check PASS (91 unit tests), vite build PASS.
Next: T1.3 (input file node).

### 2026-11-17 T1.1 Flow definition schema
Changed: src/engine/flow/{types,validate}.ts, validate.test.ts (26 tests), docs/DECISIONS.md (D12, D13).
How: envelope shaped like React Flow, port registry for all 11 node types (Filter match/nomatch, Lookup left/right, Append and SQL in1..n), hand-written validator with codes for shape, schema version, duplicate id, unknown type, unknown node, unknown handle, missing input, doubled input and cycle (path named), `topologicalOrder` and `resolveEdgeHandles` for T1.2. No `ajv`.
Orientation: expected Summary header lists categories in reference-table order including zero columns; both datasets share identical reference tables, so T1.16 is not on the acceptance path.
Gates run: check PASS (79 unit tests).
Advisor consulted at the start of Phase 1; its schema and engine notes are in D13.
Next: T1.2 (engine core). First check that DuckDB-WASM runs under Vitest in Node, otherwise record the fallback.

### 2026-11-17 T0.5 Size guard (Phase 0 complete)
Changed: src/engine/size-guard.ts (`checkFileSize`, `MAX_SAFE_XLSX_BYTES` = 300,002,342), src/ui/strings.ts (`xlsxTooLarge`), bench page enforces the guard (`?guard=off` bypasses it for the raw measurements), `npm run spike` loads a sparse xlsx just above the limit with the guard on and fails if the warning does not appear, report section "Size guard", raw results now store `fileBytes`. Tests: 5 for the guard, 1 for the message, 2 for the report section, and a test that fails when the limit is above the largest xlsx that loaded in docs/spike-raw.json.
Full `npm run spike` (exit 0, 12 runs + guard check): chosen xlsx strategy `xlsx-stream` (101.8 s and 1,159 MB at 1,048,576 rows); a 301 MB xlsx was refused in 186 ms with the "save the sheet as .csv" message.
Gates run: check PASS (53 unit tests), spike PASS (exit 0).
Advisor consulted before ticking the last Phase 0 task: tick approved; guard requirement carried into T1.3 and T2.16 above; limits recorded in D11.
Next: Phase 1, T1.1. Phase 0 is done; the build is not.

### 2026-11-17 T0.4b Streaming strategy in the benchmark, SPIKE_RESULTS.md
Changed: bench worker and page (`xlsx-stream` strategy), run plan (two strategies per file, 12 runs), scripts/lib/spike-report.ts (+ 9 tests) that renders docs/SPIKE_RESULTS.md from docs/spike-raw.json with a rule to choose the strategy, `npm run spike` writes both files (partial `--sizes` runs write nothing unless `--write`), small-file browser spec for the new strategy.
Full `npm run spike`: 12 runs, exit 0, no crash, no timeout. Chosen xlsx strategy: `xlsx-stream` (3 of 3 sizes; SheetJS whole-sheet 1 of 3). xlsx-stream: 100k 8.4 s / 774 MB, 500k 46.5 s / 1,077 MB, 1M 104.1 s / 1,122 MB. csv with DuckDB read_csv: 0.8 s, 3.1 s, 5.5 s; peak 378, 662, 1,134 MB. Group-by 30 to 76 ms for csv, 37 to 53 ms for xlsx-stream. 200,000-row xlsx target met by estimate only (17.9 s, interpolated); not measured directly.
Gates run: check PASS (45 unit tests), spike PASS (exit 0), spike:smoke PASS (7 tests).
Next: T0.5 (size guard). Advisor review before ticking the last Phase 0 task.

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
