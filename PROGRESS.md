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
- [x] T1.18 `flows/monthly-timesheet.flow.json`, part 1: reading, unpivot, dates, employment window, Exceptions sheet (rules R1 to R9).
- [x] T1.19a `flows/monthly-timesheet.flow.json`, part 2a: OT_breaches sheet (R11), sort order (R12).
- [x] T1.19b `flows/monthly-timesheet.flow.json`, part 2b: Summary sheet (R10, needs the breach count of T1.19a), sort order (R12). The Summary output step goes first in the flow, so that the sheet is first in the workbook.
- [x] T1.20 Both datasets pass `npm run test:acceptance`. Add the test that no network request carries file content.

## Phase 2: Canvas and screens (gates G3, G4)

- [x] T2.1 Design tokens, global styles, font, and the UI-rules test skeleton.
- [x] T2.2 Base components: Button, Badge, Card, Table, Field, Search field.
- [x] T2.3 Dropdown and Date picker, with keyboard support and tests.
- [x] T2.4 Checkbox, Tabs, Dialog, Toast, Skeleton, Empty state, Error state.
- [x] T2.5 `/dev/components` route that matches screen 7.
- [x] T2.6 `DataStore` interface, `LocalStore`, and seed data that matches the screens.
- [x] T2.7 App shell: sidebar, page header, routing, strings module.
- [x] T2.8 Flows screen: list, filters, search, delete with confirm, loading and empty states.
- [x] T2.9 Builder, part 1: canvas with React Flow, step cards, add by drag from the step list, connect, select, delete, zoom controls.
- [x] T2.10a Builder, part 2a: settings panel shell (380 px) with Setup, Configure and Test tabs; Setup has the step name, "Input from" for each input (the keyboard way to connect, open point of T2.9) and Delete step.
- [x] T2.10b Builder, part 2b: step preview. Test tab runs the steps upstream of the selected step in the browser on test files chosen by the user, and shows the first 100 rows in a table, with loading, error and empty states.
- [x] T2.11a Settings forms, part 1: the Configure tab renders the form of the step type; forms for Input file (name, sheet, header row, rows to skip, fill down, row number column) and Filter (condition formula with syntax check).
- [x] T2.11b Settings form: Column mapping, a grid of one row per source column (keep, new name, type) that accepts a paste from Excel and can load the source columns from a test file.
- [x] T2.12 Settings forms: Formula column with editor, function list, validation message.
- [x] T2.13a Settings forms, part 3: Lookup / Join (source, key pairs, brought columns, no-match behaviour) and Group by (group columns, aggregations), with a shared column picker.
- [x] T2.13b Settings forms, part 4: Unpivot (keep and unpivot columns, name and value columns, skip blanks) and Pivot (row keys, column source, value, aggregation, column list from the data or a reference table, fill value, name prefix and suffix, name case).
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

### 2026-11-17 T2.13b Settings forms, part 4: Unpivot and Pivot
Changed: src/ui/builder/forms/{reshape-logic.ts(+8 tests),unpivot-form.tsx,pivot-form.tsx}, default settings for both types, `reshapeStrings`, e2e/reshape.spec.ts (9 tests), two UI-rules states, docs/DECISIONS.md (D46).
How: Unpivot (keep and unpivot lists that cannot overlap, name and value columns, skip blanks, "Unpivot all other columns" once columns are loaded) and Pivot (row keys, column source, value, aggregation, new columns from the data or a reference table, fill value with number / blank / default, prefix, suffix, letter case). Each form says in words what is still missing.
Checked by effect on real previews: unpivot gives 4 rows with the columns id, day, hours and 3 rows with skip blank; pivot gives mon and tue with 0 for a missing combination, blank or -1 by the fill value; a reference table lists OT_DAY, OT_NIGHT, OT_REST, OT_HOLIDAY in its order; count needs no value; an average of a text column shows the engine message.
Test mistake of mine: I expected the letter case to change the prefix and suffix; the engine keeps them as typed (D25), so the label and a hint now say so.
Gates run: check PASS (552 tests), test:e2e PASS (93 tests), test:ui-rules PASS (220 tests: 110 per width, 17 route states), test:acceptance PASS (7 tests).
Next: T2.14 (Append, Output, SQL forms).

### 2026-11-17 T2.13a Settings forms, part 3: Lookup / Join and Group by (T2.13 split into T2.13a and T2.13b)
Changed: src/ui/builder/forms/{column-pickers.tsx(+css),lookup-form.tsx,group-by-form.tsx,lookup-logic.ts(+8 tests)}, `loadSourceColumns` and `useSourceColumns` take an input handle, default settings for both step types, `pickerStrings`, `joinStrings`, `groupStrings`, e2e/joins.spec.ts (8 tests), two UI-rules states, docs/DECISIONS.md (D45). PROGRESS: T2.13 split into T2.13a and T2.13b (Unpivot, Pivot).
How: Lookup / Join form (source: another step or a reference table; key pairs; columns to bring with new names; no-match behaviour) and Group by form (group column chips; aggregations with function, column, result name). Column choices are dropdowns once the columns are loaded and text fields before; each form says what is still missing in words.
Checked by effect on real previews: reference-table lookup brings 16 and 40 and a blank for no match; Drop the row gives 2 rows; Stop with an error names YEAR; Group by gives sum 5 and count 2 for A and count 1 for B; a sum of a text column shows the engine's message.
Gates run: check PASS (544 tests), test:e2e PASS (84 tests), test:ui-rules PASS (196 tests: 98 per width, 15 route states), test:acceptance PASS (7 tests).
Next: T2.13b (Unpivot and Pivot forms).

### 2026-11-17 T2.12 Settings form: Formula column with editor, function list, validation message
Changed: src/ui/builder/forms/{formula-editor.tsx,formula-column-form.tsx,filter-form.tsx,formula-logic.ts,function-docs.ts,use-source-columns.ts,load-columns.ts (now returns types)}, TextAreaField `textareaRef`, `formulaStrings`, 20 unit tests (formula logic, function list), e2e/formula.spec.ts (10 tests), two UI-rules states (editor, function list open), docs/DECISIONS.md (D44). The old syntax-only check was replaced by the shared editor.
How: Formula column form (name, formula, message, function buttons, All functions dialog with search, Insert a column, Load columns). The message gives the result type once the columns are loaded and the engine's own compile message for a wrong column or type. The Filter form uses the same editor and also demands true or false.
Checked by effect: a formula adds a column to a real preview (62 and 84); inserts land at the cursor; an unknown column gives "Character 1: ... agee"; a Filter with a number result is refused once columns are loaded; controls are disabled for a published version.
Test mistakes of mine, fixed: I counted 48 functions, the registry has 50 (the e2e test now reads the list); a second insert goes where the cursor is, not at the end; the seed has no Formula column step, so the read-only test injects one.
UI rules found three real defects in the open function list, all fixed: item buttons were two-line variable-height buttons (only 36 and 40 px exist), their accessible names did not contain their visible text, and the group headers were invalid list items. Each row is now text plus a 36 px "Insert" button. A flaky e2e test (insert, then fast typing) exposed a real race: the caret was restored in `requestAnimationFrame` after the new text; it is now restored in a layout effect in the same commit.
Gates run: check PASS (536 tests), test:e2e PASS (76 tests), test:ui-rules PASS (172 tests: 86 per width, 13 route states), test:acceptance PASS (7 tests).
Next: T2.13 (Lookup / Join, Group by, Unpivot, Pivot forms).

### 2026-11-17 T2.11b Settings form: Column mapping grid with paste from Excel
Changed: src/ui/builder/forms/{column-mapping-logic.ts(+10 tests),column-mapping-form.tsx,column-mapping-form.module.css,load-columns.ts}, form `context` (test files, reference tables), Checkbox `label`, `formStrings.mapping`, e2e/mapping.spec.ts (8 tests), ui-rules grid state, docs/DECISIONS.md (D43).
How: one labelled row for each column (keep box, source, new name, type dropdown, remove); "Load columns from test file" runs the steps before and adds the missing columns; "Paste from Excel" dialog and a direct paste onto the grid read tab separated cells (source, new name, type, keep), replace the list, and refuse the whole paste with the row and what to do when a cell is wrong; a source listed twice saves nothing and says so.
Checked by effect in the browser: loaded columns, keep/rename/retype change a real preview, unlisted columns stay, pasted rows drive the preview, a real paste event on the grid, bad paste refused, read-only for a published version. Looked at a screenshot of the panel: layout is clean.
Gates run: check PASS (526 tests), test:e2e PASS (66 tests), test:ui-rules PASS (148 tests: 74 per width, 11 route states), test:acceptance PASS (7 tests).
Next: T2.12 (Formula column form with editor, function list, validation message).

### 2026-11-17 T2.11a Settings forms, part 1: Configure tab, Input file, Filter (T2.11 split into T2.11a and T2.11b)
Changed: src/ui/builder/forms/{types,index,input-file-logic,input-file-form,filter-form,formula-check}.ts(x), forms.test.ts (11 tests), `TextAreaField` component, `updateSettings`, Configure tab in the settings panel, `formStrings`, e2e/forms.spec.ts (7 tests), ui-rules Configure tab state, docs/DECISIONS.md (D42). PROGRESS: T2.11 split into T2.11a and T2.11b (Column mapping grid).
How: a registry of forms by step type; Input file form (name, sheet, header row, rows to skip, fill down, row number column) saves only a fully valid form and says what to do for each bad field; Filter form saves the condition as typed and checks its syntax with the engine's parser (position and reason).
Checked by effect in the browser: header row and rows to skip change a real preview; fill down fills empty cells; the row number column appears; the Filter condition splits a real preview into Match and No match; a condition that is not true or false gives the engine's message; two Input file steps cannot share a name; forms are read-only for a published version.
Gates run: check PASS (516 tests); test:e2e PASS (58 tests), test:ui-rules PASS (136 tests: 68 per width, 10 route states), test:acceptance PASS (7 tests).
Next: T2.11b (Column mapping form with paste from Excel).

### 2026-11-17 T2.10b Builder, part 2b: step preview
Changed: src/ui/builder/{preview-logic.ts,preview-runner.ts,step-preview.tsx,step-preview.module.css,preview-logic.test.ts (14 tests)}, graph.ts (`defaultSettings`, `upstreamOf`), settings panel Test tab, builder screen (test files, reference tables), `previewStrings`, e2e/preview.spec.ts (8 tests), ui-rules (Test tab state, route `name`), docs/DECISIONS.md (D41).
How: the Test tab has the effective date (date picker), a file row with a hidden file input behind a button for each Input file step in the part that runs, Match/No match chips for a Filter, and "Preview first rows". The steps up to the selected one run in the browser (DuckDB in a worker); the first 100 rows appear in a table with dates as `30 Sep 2026`, numbers right-aligned, rows 57 px, and "Showing the first 100 of N rows." Loading shows a skeleton and a busy button; an engine error shows "The preview could not run." with the engine's message; a changed flow or date marks the result as out of date. An Output step previews what feeds it.
Browser checks: the real DuckDB run in Chromium (2 rows, 250 rows capped at 100, a date column, a duplicate-header error), a privacy test (a marker text in a csv appears in no request, all requests are same-origin GETs).
Small bug of mine found by the unit test: the sub-flow version started on `0001-01-01`, which is not a real date in this engine (JavaScript reads year 1 as 1901); now `1900-01-01`.
Gates run: check PASS (506 tests), test:e2e PASS (51 tests), test:ui-rules PASS (124 tests: 62 per width, 9 route states), test:acceptance PASS (7 tests).
Next: T2.11 (settings forms: Input file, Column mapping with paste from Excel, Filter).

### 2026-11-17 T2.10a Builder, part 2a: settings panel shell (T2.10 split into T2.10a and T2.10b)
Changed: src/ui/builder/{settings-panel.tsx,settings-panel.module.css}, graph.ts (`sourceOptions`, `currentSource`, `setInput`, `inputTitle`; +6 tests), `settingsStrings`, builder screen layout, e2e/settings-panel.spec.ts (7 tests), ui-rules `prepare` hook (builder route selects a card), popover `opensUp` fix, docs/DECISIONS.md (D40). PROGRESS: T2.10 split into T2.10a and T2.10b (preview).
How: 380 px panel with the selected step's number, name, type and hint, tabs Setup / Configure / Test; Setup has the step name and "Input from" per input port (keyboard way to connect, closes the open point of T2.9), Delete step in the footer; read-only for published versions.
Flaky test found and fixed: the date picker "opens upward" test failed once in a full run. Cause was real: the popover first opened downward, took focus (page scrolled) and flipped later. The decision is now taken in the click handler.
Gates run: check PASS (495 tests), test:e2e PASS (43 tests, two full runs), test:ui-rules PASS (112 tests, builder checked with a step selected), test:acceptance PASS (7 tests).
Next: T2.10b (step preview).

### 2026-11-17 T2.9 Builder, part 1: canvas
Changed: src/ui/builder/{graph.ts(+18 tests),step-card,step-list,zoom-controls,canvas,builder-screen}.tsx, builder.module.css, Button `block` prop, `builder` strings, route `/flows/:id/versions/:versionNo`, dependency `@xyflow/react` 13.0.1, e2e/builder.spec.ts (9 tests), ui-rules route for the builder, docs/DECISIONS.md (D39).
How: header bar 64 px (Flows link, name, status badge, Run cta), step list 184 px with the groups Files, Shape, Combine, Advanced (36 px buttons, draggable, Enter adds), canvas with 240 x 56 step cards (number, name, type; inputs on top, outputs at the bottom; Filter has match and no match, Lookup left and right), connect by dragging handles, select with a 2 px accent border, delete with Backspace or Delete, own zoom controls and a step summary. Published versions are read-only.
Found by the tests: (1) a selected card was raised, so its edge covered the handles of other cards and blocked the next connection; fixed with `elevateNodesOnSelect={false}`. (2) axe: `aria-label` on role-less divs (22 nodes); fixed with the node `ariaLabel`. (3) header bar measured 65 px; fixed to 64. (4) a `display: contents` wrapper does not start a drag; the Button is the drag source now. (5) landmark: the builder needed a `<main>`.
Open: keyboard connection of handles (planned with the settings panel, T2.10); Save draft and Publish (T2.15).
Gates run: check PASS (489 tests), test:ui-rules PASS (112 tests: 56 per width, 8 routes incl. the builder), test:e2e PASS (36 tests, rerun after the last edits), test:acceptance PASS (see the Evidence block of this turn).
Next: T2.10 (settings panel shell with Setup, Configure and Test tabs, step preview table).

### 2026-11-17 T2.8 Flows screen
Changed: src/ui/screens/{flows.tsx,flows.module.css,flows-logic.ts(+9 tests)}, ButtonLink component, `flowsScreen` strings, shell outlet context and ToastProvider, store `ownerName`/`groupNames`, table CSS, e2e/flows.spec.ts (8 tests), ui-rules skeleton test, docs/DECISIONS.md (D38).
How: list with name and step counts, scope badge and groups, owner, version in effect with status badge, effective range, Open / Run / Delete (row-named, compact, only where allowed); scope chips and search; confirm dialog before delete with a toast after; skeleton after 300 ms with `aria-busy`; empty state (no flows) and no-match state; error panel with Try again.
UI rules found a real defect: rows measured 56 px and the header 40.5 px with collapsed table borders (advisor had warned). Fixed in the Table component with separate borders; skeleton and table now match exactly.
Gates run: check PASS (471 tests), test:e2e PASS (27 tests), test:ui-rules PASS (100 tests: 50 per width, 7 routes incl. skeleton test for /flows).
Next: T2.9 (builder part 1: canvas).

### 2026-11-17 T2.7 App shell
Changed: src/ui/{shell.tsx,shell.module.css,store-context.tsx,app.tsx,strings.ts}, screens/placeholder.tsx, components/screen-frame.tsx, flow/table/shield icons, e2e/{smoke,shell}.spec.ts (6 tests), ui-rules route list (five sidebar routes).
How: `Shell` = sidebar 232 px (brand, cta "Create flow", Flows, Reference tables, Admin for admins only, user card) plus the main column (32 px 40 px, 24 px gap). `StoreProvider`, `useStore` and `useLoad` give screens the store. "Create flow" opens a dialog (name, scope for the admin), shows an error panel for an empty name, then makes the flow and opens `/flows/:id/versions/1`. Routes: `/` redirects to `/flows`; `/flows`, `/flows/:id/run`, `/flows/:id/versions`, `/reference-tables`, `/admin` are placeholders with the real header and first block; the builder route is a placeholder without sidebar (T2.9). All UI text is in `strings.ts`.
First browser run of `IndexedDbAdapter`: a flow created in the UI is found in IndexedDB (open item of T2.6 closed).
Mistake of mine caught by the e2e test: the create-flow navigation went to a route that did not exist yet, so the wildcard sent the user back; added the builder placeholder route.
Gates run: check PASS (462 tests), test:e2e PASS (19 tests), test:ui-rules PASS (98 tests: 49 per width, 7 routes).
Next: T2.8 (Flows screen).

### 2026-11-17 T2.6 DataStore, LocalStore, seed data
Changed: src/store/{types,local-store,seed,indexeddb-adapter,index}.ts, local-store.test.ts (30 tests), docs/DECISIONS.md (D37).
How: async `DataStore` interface (flows, versions, copy, group access, soft delete and restore, reference tables and versions, users, groups, run log). `LocalStore` enforces SPEC section 7 in code, the version rules (read-only published, rule 6 end date, no overlap, 50,000-row limit) and the 30-day purge. IndexedDB for persistence (localStorage cannot hold 50,000 rows), memory adapter for tests. Dev and test builds read `dfw.seed` and `dfw.loadDelayMs` from localStorage (inject the real timesheet flow and tables; delay for the skeleton rule). Seed = what the screens show; not copied from `testcase/`.
Not yet run in a browser: `IndexedDbAdapter` and `createLocalStore` (first use in T2.8).
Gates run: check PASS (462 tests). No route changed, so test:e2e and test:ui-rules were not rerun.
Next: T2.7 (app shell: sidebar, page header, routing, strings module).

### 2026-11-17 T2.5 `/dev/components` route, real e2e runner
Changed: src/ui/screens/dev-components.{tsx,module.css}, src/ui/app.tsx (route), PageHeader and ProgressBar components, `devStrings` in strings.ts, `defaultOpen` on Dropdown and Date picker, playwright.e2e.config.ts (`npm run test:e2e` is real now; old dev-server config removed), e2e/components.spec.ts (12 tests), ui-rules route list, eslint/.gitignore for `dist-e2e`, docs/DECISIONS.md (D36).
Browser tests now cover the T2.3 and T2.4 behaviour: Dropdown (click, arrows, Enter, Escape, Home/End, type-ahead, focus return, check mark), Date picker (Monday-first grid, arrows across a month end, PageDown, previous/next, Escape, opens upward in a 520 px window), Checkbox Space, Tabs arrows and End, Dialog focus trap and focus return, Toast, aria-busy skeleton, progress bar.
UI rules found one real violation on the new route: two `cta` buttons (the empty-state example). Fixed by making that example `primary` (D36). Title y 63, first block y 148 and axe pass on `/dev/components` at both widths.
Gates run: check PASS (432 tests), test:e2e PASS (13 tests: 12 components, 1 smoke), test:ui-rules PASS (40 tests: 20 per width, routes `/` and `/dev/components`).
Next: T2.6 (DataStore interface, LocalStore, seed data). Decide async interface, IndexedDB versus localStorage for 50,000-row reference tables, and a load-delay switch for the skeleton rule.

### 2026-11-17 T2.4 Checkbox, Tabs, Dialog, Toast, Skeleton, Empty state, Error state
Changed: src/ui/components/{checkbox,tabs,tab-keys,dialog,toast,toast-state,skeleton,states}.ts(x) with CSS modules, alert/inbox/close icons, more.test.tsx (12 tests).
How: Checkbox is a drawn box on a `role=checkbox` button (no input). Tabs: `role=tablist/tab/tabpanel`, roving tabindex, arrows wrap, Home/End, 40 px tabs with a 2 px accent underline; Chip and ChipGroup (36 px, `aria-pressed`). Dialog: modal, focus moves in, Tab wraps (`trapIndex`), Escape calls `onClose`, focus returns to the opener on unmount. Toast: provider with a polite live region, 3 kept, 5 s, dismiss button. Skeleton: `SkeletonTable` with the real heights (header 41, row 57), `aria-busy`, bars `aria-hidden`, pulse that stops with reduced motion; `useDelayedLoading` shows it only after 300 ms. EmptyState (icon, line, action) and ErrorState (`role=alert`, says what failed and what to do next).
Lint caught a ref written during render in Dialog; moved into an effect.
Not yet tested in a browser: Dialog focus trap and focus return, Tabs arrows, toast timing. T2.5 adds Playwright specs on `/dev/components`.
Gates run: check PASS (432 tests).
Next: T2.5.

### 2026-11-17 T2.3 Dropdown and Date picker
Changed: src/ui/components/{dropdown,date-picker,popover,list-keys,date-logic}.ts(x), popover.module.css, calendar icon, tests list-keys (9), date-logic (10), pickers markup (2).
How: no headless library, so no hidden native `<select>` or checkbox can appear in the DOM. Dropdown: button with chevron, `aria-haspopup=listbox`, popover list of `role=option` buttons with a check on the selected one, arrow keys, Home, End, Enter, Space, Escape (focus returns to the button), Tab closes, type-ahead (700 ms buffer), outside click closes. Date picker: button `30 Sep 2026`, popover dialog with a Monday-first month grid, previous and next month buttons (36 px), arrow keys by day and week, Home/End to Monday/Sunday, PageUp/PageDown by month with day clamping, Escape; day buttons carry `aria-label` like `1 September 2026`. Both open upward when the room below is smaller than the popover and larger above. Key handling and date arithmetic are pure functions (UTC only).
Not yet tested in a browser: open/close, focus return, opens-upward. T2.5 puts both on `/dev/components` and adds Playwright specs for them there.
Gates run: check PASS (420 tests).
Next: T2.4.

### 2026-11-17 T2.2 Base components
Changed: src/ui/components/{button,badge,card,table,field,icons}.tsx with CSS modules, index.ts, base.test.tsx (12 tests, server-rendered markup), three extra tokens (badge ink, danger soft and ink, popover shadow).
How: Button has variants cta/primary/secondary/danger, 40 px or compact 36 px, `busy` (spinner, `aria-busy`, no click); the variant is exposed as `data-variant` for the one-cta rule. Table: 10/16 px header, 56 px rows plus 1 px divider, right-aligned numbers, `label` as accessible name. Field ties label, hint and error with `aria-describedby`; SearchField is `type="text"` with an inner icon. Own line icons, no icon library.
Not yet measured in a browser: row height 57 and button heights on a real page; that happens when T2.5 puts the components on `/dev/components` and adds the route to the UI-rules list.
Gates run: check PASS (402 tests). test:ui-rules not rerun: no route changed.
Next: T2.3 (Dropdown and Date picker; first check the rendered DOM of any headless library for hidden native inputs).

### 2026-11-17 T2.1 Design tokens, global styles, font, UI-rules runner
Changed: src/ui/{tokens,global}.css, src/main.tsx, ui-rules/{routes,rules,routes.spec,rules.selfcheck.spec}.ts, playwright.ui-rules.config.ts, `npm run test:ui-rules` (now real), eslint/tsconfig/.gitignore for `dist-ui-rules`, deps `@fontsource/plus-jakarta-sans` 5.3.0 and `@axe-core/playwright` 4.14.0, docs/DECISIONS.md (D35).
Result: the runner builds the app, serves it with `vite preview` and runs at 1280 and 1440 px. Rules: button heights 36/40, forbidden elements, one cta, no horizontal scroll, table rows 57, header position (sidebar screens), axe serious/critical. Self-checks show each rule fails on a bad page. Pixel targets measured on the design HTML with getBoundingClientRect (title y 63, first block y 148, rows 57).
Gates run: check PASS (390 tests), test:ui-rules PASS (26 tests: 13 per width; route `/` only so far).
Advisor consulted at the start of Phase 2: plan kept; points taken into D35 and into later tasks (async DataStore and IndexedDB check in T2.6, own zoom controls in T2.9, headless-library DOM check in T2.3/T2.4).
Next: T2.2.

### 2026-11-17 T1.20 Both datasets pass; no network request carries file content (last task of Phase 1)
Changed: scripts/lib/request-audit.ts (+ 10 unit tests), acceptance/privacy.spec.ts (3 tests), acceptance/timesheet.spec.ts (audits both real runs, with the names of the employee list as markers), acceptance/helpers.ts (`watchRequests`), acceptance/page.ts (files are `File` objects, as the file picker gives them), docs/DECISIONS.md (D34).
Result: `npm run test:acceptance` exit 0, 7 tests passed: harness 2, privacy 3, timesheet flow 2 (2026-09: 3 sheets, 282 cells equal; 2026-10: 3 sheets, 336 cells equal; same flows/monthly-timesheet.flow.json). `npm run check` exit 0 (390 unit tests).
Privacy: a run loads only static assets (same origin, GET, no query, no body); markers placed in an xlsx file and in a csv file reach the output file and appear in no request. The csv input path, which the spike left open, now runs in Chromium (`registerFileHandle` on a `File`). A canary test leaks on purpose (query string, beacon, POST to another address, and a request from a Web Worker) and the audit finds each.
Advisor consulted before ticking the last task of the phase. Its one open point was that the audit might not see worker requests, where the engine runs; checked: the worker leak is found, and a real run's log contains the worker's wasm request.
Phase 1 done; the build is not. Gates `spike`, `test:e2e`, `test:ui-rules` and `test:db` have not been run in this phase, and `test:e2e`, `test:ui-rules` and `test:db` exit 1 by design until their tasks exist. STATUS stays IN PROGRESS.
Next: Phase 2, T2.1, with an advisor plan review at its start.

### 2026-11-17 T1.19b Timesheet flow, part 2b: Summary sheet
Changed: flows/monthly-timesheet.flow.json (70 steps, 77 connections; the Summary output is the first Output step), docs/DECISIONS.md (D33).
Result: `npm run test:acceptance` exit 0, 4 tests passed: the two harness self-checks, and the timesheet flow for both datasets with the same flow file. September: 3 sheets, 282 cells equal (11 summary rows, 11 exceptions, 4 breaches). October: 3 sheets, 336 cells equal (11, 19, 5). Browser time zone UTC+7.
How: helper columns for valid days and valid OT; Group by employee for work days and total OT; two Pivots with column lists from the reference tables for the category days and the OT hours per type; Lookups that bring the sheet's columns, the breach count and the exception count; Output with the expected header order.
Searches: src/ and flows/ for the fixture employee IDs: no match.
Gates run: check PASS (380 unit tests, last run before this flow change; no file under src/ changed since). test:acceptance PASS.
Next: T1.20 (both datasets pass; add the test that no network request carries file content). T1.20 is the last task of Phase 1: consult the advisor before ticking it.

### 2026-11-17 T1.19a Timesheet flow, part 2a: OT_breaches sheet
Changed: flows/monthly-timesheet.flow.json (now 53 steps, 56 connections), docs/DECISIONS.md (D32). PROGRESS: T1.19 split into T1.19a (OT_breaches) and T1.19b (Summary), because the Summary needs the breach count.
Result: with ACCEPTANCE_SHEETS=Exceptions,OT_breaches both sheets equal the expected sheets cell by cell for both datasets with the same flow file: September 102 cells (4 breaches), October 156 cells (5 breaches). The October variant exercises the ISO week 2026-W42 and two DAY breaches for one employee.
How: valid OT rows, then DAY, WEEK and MONTH streams against limits from the reference tables, Append, Output with a formula sort key for the level order.
Gates run: no change under src/. check PASS (380 unit tests, run this turn). test:acceptance: the two timesheet specs still fail while the Summary sheet is missing (expected at this stage).
Search of src/ and flows/ for the fixture employee IDs: no match.
Next: T1.19b (Summary sheet).

### 2026-11-17 T1.18 Timesheet flow, part 1 (reading, unpivot, dates, employment window, Exceptions sheet)
Changed: flows/monthly-timesheet.flow.json (30 steps, 31 connections), acceptance/datasets.ts (`ACCEPTANCE_SHEETS` to compare a subset while the flow is built in parts; the default is still all three sheets), eslint.config.js (ignore `dist-acceptance`), docs/DECISIONS.md (D31).
Result: with ACCEPTANCE_SHEETS=Exceptions, the Exceptions sheet equals the expected sheet cell by cell for both datasets with the same flow file: September 72 cells (11 exception rows), October 120 cells (19 rows), in a UTC+7 browser.
Read the oracle and the real files first: ATT cells are text, OT cells are numbers or `2h`, blanks are absent, no stray spaces. The flow follows the oracle's order of checks.
Found on the way: `npm run check` failed once the acceptance page had been built, because ESLint linted `dist-acceptance`; fixed in the same commit.
Gates run: check PASS (380 unit tests). test:acceptance FAIL, exit 1 (harness 2 passed; timesheet specs 0/2: the sheets Summary and OT_breaches are not written yet; expected at this stage).
Search of src/ and flows/ for the fixture employee IDs: no match.
Next: T1.19 (Summary sheet, rules R10 and OT_breaches sheet, rule R11, sort order R12).

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
