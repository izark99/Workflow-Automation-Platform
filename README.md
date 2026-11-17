# Data Flow Webapp

A browser app where a small team builds and runs data-processing flows on xlsx
and csv files. Flows and reference tables have versions with an effective date
range. All data processing runs in the browser.

This repository starts as a build kit. Claude Code builds the app from it, one
phase at a time.

| File | Purpose |
| --- | --- |
| `GOALS.md` | The `/goal` command for each phase. Start here |
| `PROMPT.md` | The build loop that every goal follows |
| `PROGRESS.md` | Task list, log, and blockers |
| `CLAUDE.md` | Standing rules and commands |
| `docs/SPEC.md` | What to build |
| `docs/DESIGN.md` | Design tokens, layout rules, components |
| `design/screens/` | The seven target screens |
| `testcase/` | Acceptance data and expected results. Read-only |

All data in `testcase/` and `design/` is sample data made for testing.
