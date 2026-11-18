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
