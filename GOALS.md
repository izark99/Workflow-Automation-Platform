# Goal conditions for Claude Code `/goal`

Run one phase per goal. When a goal is reached, review the result, run `/clear`
to start with an empty context, and paste the next goal. Each line below is one
command: copy it whole.

If a goal stops at its turn limit, check `PROGRESS.md`, then paste the same goal
again.

In a cloud session at claude.ai/code: select this repository, choose the
permission mode that lets Claude run commands without asking, send
`/model sonnet`, then `/advisor opus`, then paste the goal. Merge the session's
branch into `main` after each phase, so the next session starts from it.

## Phase 0: Spike

```
/goal Read PROMPT.md and follow it exactly, one task per turn, Phase 0 only. The goal is met when your Evidence block in this conversation shows all of: every Phase 0 task in PROGRESS.md is ticked; "npm run spike" exited 0 and docs/SPIKE_RESULTS.md exists with the six measurements and the chosen xlsx reading strategy; "npm run check" exited 0; "git status --porcelain testcase" is empty. Also stop when "head -1 PROGRESS.md" prints STATUS: BLOCKED, or after 15 turns.
```

## Phase 1: Engine

```
/goal Read PROMPT.md and follow it exactly, one task per turn, Phase 1 only. The goal is met when your Evidence block in this conversation shows all of: every Phase 1 task in PROGRESS.md is ticked; "npm run test:acceptance" exited 0 with both datasets passing (2026-09 and 2026-10) on the same flows/monthly-timesheet.flow.json; "npm run check" exited 0; a search of src/ and flows/ for the fixture employee IDs (E0001 to E0012, E9999) returns no match; "git status --porcelain testcase" is empty. Also stop when "head -1 PROGRESS.md" prints STATUS: BLOCKED, or after 50 turns.
```

## Phase 2: Canvas and screens

```
/goal Read PROMPT.md and follow it exactly, one task per turn, Phase 2 only. The goal is met when your Evidence block in this conversation shows all of: every Phase 2 task in PROGRESS.md is ticked; "npm run test:e2e" exited 0; "npm run test:ui-rules" exited 0 at 1280 and 1440 px; "npm run test:acceptance" and "npm run check" still exit 0; "git status --porcelain testcase" is empty. Also stop when "head -1 PROGRESS.md" prints STATUS: BLOCKED, or after 55 turns.
```

## Phase 3: Server

```
/goal Read PROMPT.md and follow it exactly, one task per turn, Phase 3 only. The goal is met when your Evidence block in this conversation shows all of: every task in PROGRESS.md is ticked; "npm run test:db" exited 0 on a local Supabase; a full "npm run gates" started after "npm ci" exited 0 with all six gates passing; "head -1 PROGRESS.md" prints STATUS: COMPLETE; "git status --porcelain testcase" is empty. Also stop when "head -1 PROGRESS.md" prints STATUS: BLOCKED, or after 30 turns.
```

## Phase 4: Accounts, themes, texts, parameters

Before you paste it: make sure `main` has every Phase 3 change and the D71 Pages build, and that line 1 of
`PROGRESS.md` says `STATUS: IN PROGRESS`. Review the "Needs Harold" rows marked Phase 4 first.

```
/goal Read PROMPT.md and follow it exactly, one task per turn, Phase 4 only. The goal is met when your Evidence block in this conversation shows all of: every Phase 4 task in PROGRESS.md is ticked, including the tasks that T4.10a added from docs/UI_AUDIT.md; "npm run test:functions" exited 0 on a local Supabase; "npm run test:ui-rules" exited 0 in the light theme at 1280 and 1440 px and in the dark theme at 1440 px; a full "npm run gates" started after "npm ci" exited 0 with all seven gates passing; "npm run test:acceptance:pages" exited 0; "git diff main -- flows/monthly-timesheet.flow.json" is empty; "head -1 PROGRESS.md" prints STATUS: COMPLETE; "git status --porcelain testcase" is empty. Also stop when "head -1 PROGRESS.md" prints STATUS: BLOCKED, or after 80 turns.
```

## Phase 5: Reference tables, idle sign-out, texts, panels

Before you paste it: make sure `main` has every Phase 4 change (and the follow-up pull requests), and that line 1 of
`PROGRESS.md` says `STATUS: IN PROGRESS`. Review the "Needs Harold" rows marked Phase 5 first, above all the first one
(who sees the rows of a reference table): the build uses the default unless the list says otherwise.

```
/goal Read PROMPT.md and follow it exactly, one task per turn, Phase 5 only. The goal is met when your Evidence block in this conversation shows all of: every Phase 5 task in PROGRESS.md is ticked, including the tasks that T5.21 added from docs/UI_AUDIT_P5.md; "npm run test:functions" exited 0 on a local Supabase; "npm run test:db" exited 0 on a local Supabase with the migrations 14 to 17 applied from zero; "npm run test:ui-rules" exited 0 in the light theme at 1280 and 1440 px and in the dark theme at 1440 px, with the routes of the collapsed panels included; a full "npm run gates" started after "npm ci" exited 0 with all seven gates passing; "npm run test:acceptance:pages" exited 0; "git diff main -- flows/monthly-timesheet.flow.json" is empty; "head -1 PROGRESS.md" prints STATUS: COMPLETE; "git status --porcelain testcase" is empty. Also stop when "head -1 PROGRESS.md" prints STATUS: BLOCKED, or after 75 turns.
```

## Phase 6: Canvas drag, input regions, parameters in input boxes, Reference table step

Before you paste it: make sure `main` has every Phase 5 change (and the follow-up pull requests), and that line 1 of
`PROGRESS.md` says `STATUS: IN PROGRESS`. Review the "Needs Harold" rows marked Phase 6 first, above all the first one
(the sample file is read in the browser and never stored): the build uses the default unless the list says otherwise.

```
/goal Read PROMPT.md and follow it exactly, one task per turn, Phase 6 only. The goal is met when your Evidence block in this conversation shows all of: every Phase 6 task in PROGRESS.md is ticked, including the tasks that T6.22 added from docs/UI_AUDIT_P6.md; "npm run test:e2e" exited 0 with the canvas drag spec inside it; "npm run test:functions" exited 0 on a local Supabase; "npm run test:db" exited 0 on a local Supabase with the migrations 14 to 18 applied from zero; "npm run test:acceptance" exited 0 with both datasets and the layout files; "npm run test:ui-rules" exited 0 in the light theme at 1280 and 1440 px and in the dark theme at 1440 px, with the routes of the parameter control, the Reference table step and the analysis panel included; a full "npm run gates" started after "npm ci" exited 0 with all seven gates passing; "npm run test:acceptance:pages" exited 0; "git diff main -- flows/monthly-timesheet.flow.json" is empty; "head -1 PROGRESS.md" prints STATUS: COMPLETE; "git status --porcelain testcase" is empty. Also stop when "head -1 PROGRESS.md" prints STATUS: BLOCKED, or after 80 turns.
```

## Phase 7: Harold design system

Before you paste it: make sure `main` has every Phase 6 change (merge the Phase 6 pull request first: the check
"`git diff main` is empty" below only means something when `main` already has Phase 6), and that line 1 of `PROGRESS.md` says
`STATUS: IN PROGRESS`. Review the "Needs Harold" rows marked Phase 7 first, above all the first four (where the look comes from,
the default theme, the end of the orange call-to-action, the text size): the build uses the default unless the list says
otherwise. This phase changes the look only; it reads `design/harold/` and does not need access to the design system itself.

```
/goal Read PROMPT.md and follow it exactly, one task per turn, Phase 7 only. The goal is met when your Evidence block in this conversation shows all of: every Phase 7 task in PROGRESS.md is ticked, including the tasks that T7.19 added from docs/UI_AUDIT_P7.md; "npm run test:e2e" exited 0 with the canvas drag spec inside it and unchanged; "npm run test:ui-rules" exited 0 in the light theme at 1280 and 1440 px and in the dark theme at 1440 px, with the Harold rules and the /dev/components route included; "npm run test:functions" exited 0 on a local Supabase; "npm run test:db" exited 0 on a local Supabase with the migrations 1 to 18 applied from zero; "npm run test:acceptance" exited 0 with both datasets and the layout files; a full "npm run gates" started after "npm ci" exited 0 with all seven gates passing; "npm run test:acceptance:pages" exited 0; "git diff main -- src/engine src/store supabase flows" is empty; "git status --porcelain testcase" is empty; "head -1 PROGRESS.md" prints STATUS: COMPLETE. Also stop when "head -1 PROGRESS.md" prints STATUS: BLOCKED, or after 70 turns.
```

## Phase 8: Faster building and more steps

Before you paste it: make sure `main` has every Phase 7 change and the follow-up pull requests (the admin features, the dialog and panel fixes, the scroll bar), and that line 1 of
`PROGRESS.md` says `STATUS: IN PROGRESS`. Review the "Needs Harold" rows marked Phase 8 first, above all the first three (the layout of Auto arrange, adding after the selected step, copy and paste): the build uses the default unless the list says otherwise. This phase has no migration and no server part.

```
/goal Read PROMPT.md and follow it exactly, one task per turn, Phase 8 only. The goal is met when your Evidence block in this conversation shows all of: every Phase 8 task in PROGRESS.md is ticked, including the tasks that T8.19 added from docs/UI_AUDIT_P8.md; "npm run test:e2e" exited 0 with the canvas drag spec inside it and unchanged; "npm run test:ui-rules" exited 0 in the light theme at 1280 and 1440 px and in the dark theme at 1440 px, with the canvas controls, the popup and the card and form of every new step included; "npm run test:functions" exited 0 on a local Supabase; "npm run test:db" exited 0 on a local Supabase with the migrations 1 to 20 applied from zero; "npm run test:acceptance" exited 0 with both datasets, the layout files and the generated flow of each new step; a full "npm run gates" started after "npm ci" exited 0 with all seven gates passing; "npm run test:acceptance:pages" exited 0; "git diff main -- supabase src/store" is empty; "git diff main -- flows/monthly-timesheet.flow.json" is empty; "git status --porcelain testcase" is empty; "head -1 PROGRESS.md" prints STATUS: COMPLETE. Also stop when "head -1 PROGRESS.md" prints STATUS: BLOCKED, or after 90 turns.
```

## Phase 9: Print layout and linked reference tables

Before you paste it: merge the Phase 8 pull request first, and make sure line 1 of `PROGRESS.md` says `STATUS: IN PROGRESS` (the build sets it back when it starts, if Phase 8 set it to COMPLETE). Review the "Needs Harold" rows marked Phase 9 first, above all the print format (xlsx through ExcelJS, no PDF), the tokens of the header lines, and when a linked table changes and how the admin is told: the build uses the default unless the list says otherwise. This phase adds migration 21 and the ExcelJS dependency; deploying it is a human step described in `docs/DEPLOY.md`.

```
/goal Read PROMPT.md and follow it exactly, one task per turn, Phase 9 only. The goal is met when your Evidence block in this conversation shows all of: every Phase 9 task in PROGRESS.md is ticked, including the tasks that T9.19 added from docs/UI_AUDIT_P9.md; "npm run test:e2e" exited 0 with the canvas drag spec inside it and unchanged; "npm run test:ui-rules" exited 0 in the light theme at 1280 and 1440 px and in the dark theme at 1440 px, with the print group, the print preview, the link dialog and the notice included; "npm run test:functions" exited 0 on a local Supabase; "npm run test:db" exited 0 on a local Supabase with the migrations 1 to 21 applied from zero; "npm run test:acceptance" exited 0 with both datasets, the layout files, the generated flow of each Phase 8 step and the print layout flow; a full "npm run gates" started after "npm ci" exited 0 with all seven gates passing; "npm run test:acceptance:pages" exited 0; "git diff main -- flows/monthly-timesheet.flow.json" is empty; "git status --porcelain testcase" is empty; "head -1 PROGRESS.md" prints STATUS: COMPLETE. Also stop when "head -1 PROGRESS.md" prints STATUS: BLOCKED, or after 90 turns.
```
