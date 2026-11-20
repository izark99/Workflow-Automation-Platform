# Build loop prompt: Data Flow Webapp

You are building the Data Flow Webapp in this repository. You work in a loop
driven by a goal condition (Claude Code `/goal`): after each turn an evaluator
reads this conversation, and starts another turn until the condition holds.
Treat every turn as one iteration. Your context may be compacted or cleared
between iterations, so trust the repository, not your memory. Do one small,
verified piece of work per iteration, record it, and stop.

The goal conditions for each phase are in `GOALS.md`. The evaluator cannot run
commands or read files. It sees only what you print, so every iteration ends
with the Evidence block described in section 3.

## 1. Read first, every iteration

1. `CLAUDE.md`: standing rules and commands.
2. `PROGRESS.md`: status line, task list, log, blockers.
3. Only the parts you need of `docs/SPEC.md`, `docs/DESIGN.md`, `testcase/TEST_RULES.md`, and `docs/DECISIONS.md`.

Order of authority when sources disagree: `testcase/TEST_RULES.md`, then
`docs/SPEC.md`, then `docs/DESIGN.md`, then `design/screens/`.

## 2. Goal

The build is complete when every gate below passes in one clean run of
`npm run gates`, started from a fresh install (`npm ci`).

| Gate | Command | Passes when |
| --- | --- | --- |
| G0 Spike | `npm run spike` | The benchmark runs in headless Chromium for the six files in SPEC section 8 and writes load time, peak memory and run time to `docs/SPIKE_RESULTS.md`. That file states the chosen xlsx reading strategy. If xlsx at the full row limit fails, the app shows the "save as csv" warning instead of crashing |
| G1 Engine | `npm run test:acceptance` | One flow definition, `flows/monthly-timesheet.flow.json`, run through the real engine in Chromium, produces a workbook equal to the expected workbook, cell by cell, on the sheets `Summary`, `Exceptions`, `OT_breaches`, for both datasets: `testcase/` with effective date 2026-09-30 and `testcase/variant_2026-10/` with 2026-10-31 From Phase 6 also: a generated set of files whose table sits inside a larger sheet (a title block above, a footer below, merged cells, a later header row, csv as well) is run through the same engine with the region settings and equals the expected rows cell by cell; the analysis of a sample file finds the region of each clear layout and reports low confidence on the ambiguous ones; a flow with a Reference table step runs with the table version of the effective date (two versions, two dates), and a flow whose Input step takes its sheet and header row from parameters runs. |
| G2 Unit | `npm run check` | Type check, lint and unit tests pass. Every node type and every Tier 1 formula function has unit tests |
| G3 Screens | `npm run test:e2e` | In Chromium at 1440 x 900: a user creates a flow on the canvas from an empty state, adds and connects steps, configures them, previews a step, runs the timesheet flow with the September files, and downloads a workbook that equals the expected one. Versions, reference tables, admin and delete-restore journeys from SPEC sections 4 and 7 pass on the local data store. From Phase 5 also the journeys of SPEC 12.5: import of csv and xlsx files into reference tables, what a user sees of them, sign-out after inactivity, both languages of a text in one Save, collapsing every panel From Phase 6 also the journeys of SPEC 13.4: dragging steps stays inside the frame-time budgets with no step disappearing and one change per drag; an Input step is set up from a sample file with Analyze file and runs; settings of several steps take a parameter and the Test tab and the Run screen show the resolved values; a Reference table step is dragged in, a table is chosen, and it feeds a Lookup and an Append; the date check warns about a gap; a file that lacks a required column stops with the message; the analysis sends no request that carries file content. |
| G4 UI rules | `npm run test:ui-rules` | The rules in `docs/DESIGN.md` hold on every route at 1280 and 1440 px in the light theme, and at 1440 px in the dark theme (from Phase 4): only 40 px and 36 px buttons; none of the forbidden native elements; title and first block at the same y on all sidebar screens; table rows 57 px; at most one `cta` button per screen; no horizontal page scroll; skeleton with `aria-busy` during a delayed load; no serious or critical axe violations. From Phase 4 also: info buttons exactly 24 x 24 px; no visible hint paragraphs; every visible text comes from the catalog (pseudo-locale check, task T4.7a). From Phase 5 also: the routes with each kind of panel collapsed hold the same rules (title y and first block y unchanged, panel widths 232 or 64, 184 or 48, 380 or 48 px), and the new dialogs and tabs are routes From Phase 6 also: the routes of the parameter control (every state), a field that uses a parameter and a failed one, the Reference table step in each state, the date check warning, the analysis panel in each state, the region settings, and the Run screen with resolved values hold the same rules, with the pseudo-locale check. |
| G5 Server | `npm run test:db` | On a local Supabase: migrations apply from zero, and row-level security tests prove every cell of the permission table in SPEC section 7, the no-overlap rule for versions, soft delete and restore. From Phase 4 also: a locked user's open session reads and writes nothing; `ui_texts` rules. From Phase 5 also: `app_settings`, `flow_ref_tables`, the rows of a reference table readable only by the admin and by a user for whom a flow uses it, and the function that saves two texts in one transaction From Phase 6 also: migration 18 (the function that lists the tables a definition reads, through Lookup, Pivot and the Reference table step, the trigger and the backfill) with the same cases as the engine, and read access to a table that only the Reference table step uses. |
| G6 Functions (Phase 4) | `npm run test:functions` | On a local Supabase with the Edge Functions running: `admin-users` creates an account, resets a password, locks and unlocks, and refuses every call from a non-admin, a locked admin, a signed-out caller, and the last-admin and self-lock cases |

When all gates pass (six up to Phase 3, seven from Phase 4), set line 1 of `PROGRESS.md` to `STATUS: COMPLETE`, print the
Evidence block with the output of `npm run gates`, and end your reply with:

`DFW BUILD COMPLETE`

Never print that line in any other case. A false completion signal is the worst
possible outcome of an iteration.

## 3. One iteration

1. Run `git status`. If the tree is dirty from an interrupted iteration, inspect it: finish it if it is small and clear, otherwise `git stash` and note it in the log.
2. Read `PROGRESS.md`. If line 1 is `STATUS: COMPLETE`, run `npm run gates` once. If it still passes, print the completion line and stop. If not, set `STATUS: IN PROGRESS`, log what broke, and continue.
3. Pick the first unchecked task whose dependencies are done. If it is too big for one iteration (more than about 400 changed lines or more than one concern), split it into smaller tasks in `PROGRESS.md` first, and take the first one.
4. Write the tests for the task, then the code. Keep the change small.
5. Run the gate commands that the task touches, and always `npm run check`.
6. If green: commit with a message that starts with the task id, tick the task, add a log entry, and push the branch. Push after every commit: the session's machine can be replaced at any time, and only pushed work survives.
7. If red after three honest attempts: revert the attempt, add an entry under Blockers with the exact error and what you tried, and stop. The next iteration will take a different task or a different approach.
8. Print the Evidence block, then stop. Do not start a second task in the same iteration.

Evidence block, at the end of every reply, copied from real command output:

```
EVIDENCE
turn: 7 (if the goal has a turn limit)
task: T1.4 done | T1.4 blocked | none
commands: npm run check -> exit 0 (212 passed) ; npm run test:acceptance -> exit 1 (0/2 datasets)
head -1 PROGRESS.md: STATUS: IN PROGRESS
tasks: 9 ticked, 46 open (phase 1: 4 ticked, 16 open)
git status --porcelain testcase: (empty)
```

Log entry format, newest first:

```
### 2026-11-18 T1.4 Unpivot node
Changed: src/engine/nodes/unpivot.ts, tests.
Gates run: check PASS (212 tests), test:acceptance FAIL (Summary 0/11 rows, expected at this stage).
Next: T1.5.
```

Report gate results exactly as they ran. Never write PASS for a command you did
not run in this iteration.

## 4. Hard rules

**The tests are the judge. Do not bend them.**

- Never edit anything under `testcase/`, including the expected workbooks, the rules, and the two Python scripts.
- Never special-case fixture values: no employee IDs, names, dates, counts or expected numbers in `src/` or in the flow definition. The flow definition holds logic only. Limits and codes come from reference tables.
- Never delete, skip, loosen or mock away a failing test to get a green run. If a test is wrong, say why under Blockers and stop.
- The acceptance comparison must load both workbooks and compare values cell by cell: same sheet names, same header row, same row order, same values. Numbers equal within 1e-9. Dates compared as dates. Empty cell equals empty cell.
- Both datasets must pass with the same flow file and the same code path.

**Scope**

- Build only what `docs/SPEC.md` lists as in scope. Tier 2 formula functions and everything under "Out of scope" stay out.
- Do not deploy, do not create cloud projects, do not touch real credentials. Deployment is a human step, described in `docs/DEPLOY.md`, which you write in task T3.9 and extend in Phase 4 (new migrations, the Edge Function). Edge Functions run only on the local Supabase in this loop.
- Do not add a dependency outside the stack in section 6 unless a task cannot be done without it. If you add one, record the reason in `docs/DECISIONS.md`.

**Data**

- Input files and their rows never leave the browser. No network request may carry file content. Add a test that fails if a run sends any request other than loading static assets.
- No personal data in reference tables, seeds, logs, or `run_log`.

**Code**

- TypeScript in strict mode. Code, comments and commit messages in English. The default UI text (the `en` catalog) is English; other languages are data files of the catalog (Phase 4).
- Up to Phase 3: UI strings in one module. From Phase 4: every visible text is a catalog key read through `t()`; no literal UI text in components. Design tokens as CSS variables. No raw hex colors outside `tokens.css`.
- When the spec is silent, choose the simplest behaviour that fits `TEST_RULES.md`, record it in `docs/DECISIONS.md`, and continue. Do not stop to ask.

## 5. Advisor

If an advisor model is enabled, it is expensive: each call re-reads the whole
conversation. Consult it only at these points, and say in one line why:

- At the start of a phase, to review your plan for that phase.
- Before you choose between two designs that are hard to undo (flow definition schema, engine execution model, formula parser design, row-level security model).
- After two failed attempts at the same task, before the third.
- Before you set `STATUS: COMPLETE` or tick the last task of a phase.

Do not consult it for routine tasks, for writing tests, or to confirm work that
the tests already prove.

## 6. Stack

Fixed. Check the current official documentation of each library before you
first use it, and pin the versions you install.

| Area | Choice |
| --- | --- |
| App | Vite, React, TypeScript, React Router |
| Canvas | React Flow |
| Engine | DuckDB-WASM, running in a Web Worker |
| Files | SheetJS for reading and writing xlsx and csv. Follow its current official install instructions |
| Formula | A small parser of your own that turns Tier 1 formulas into DuckDB SQL |
| Styling | CSS variables and CSS modules. A headless accessibility library is allowed. No styled UI kit |
| Data store | One `DataStore` interface with two implementations: `LocalStore` (browser storage, used by default and by G3 and G4) and `SupabaseStore` (used when Supabase environment variables are set) |
| Server | Supabase: SQL migrations, row-level security, Auth. Local Supabase through its CLI for tests. From Phase 4: one Supabase Edge Function (TypeScript on Deno, the Supabase runtime) for account actions; it is the only server code |
| Texts (Phase 4) | A small message catalog of your own: keys, `{name}` placeholders, `plural` forms. No i18n library unless the plural rules need one (record it in `docs/DECISIONS.md`) |
| Tests | Vitest for unit tests, Playwright for acceptance, e2e and UI rules, axe for accessibility |

Architecture rules:

- `src/engine/` has no React and no Supabase imports. It takes a flow definition, input tables, reference tables and an effective date, and returns output tables.
- Each node type is one module that compiles its settings to SQL. The engine runs the nodes in topological order as DuckDB views or tables.
- The canvas reads and writes the same flow definition JSON that the engine runs. There is no second format.
- The app works fully on `LocalStore`, with seed data that matches the screens in `design/screens/`. Supabase is an adapter, not a requirement for phases 0 to 2.

## 7. When to stop and wait for a human

Set line 1 of `PROGRESS.md` to `STATUS: BLOCKED` with one sentence, print the
Evidence block, and end your reply with `DFW BUILD BLOCKED: reason`, only when
every remaining task of the current phase needs one of these:

- Docker or the Supabase CLI is not available for G5.
- A decision listed in `PROGRESS.md` under "Needs Harold" changes what you would build.
- A test in `testcase/` looks wrong.

If only some tasks are blocked, skip them, note it, and keep working on the rest.

## 8. Start

Read `CLAUDE.md` and `PROGRESS.md` now, then do one iteration.
