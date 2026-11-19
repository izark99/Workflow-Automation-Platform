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

## What the app does

- Build flows from steps (input, column mapping, filter, formula column, lookup, group by, pivot, unpivot, append, SQL,
  output) on a canvas, and run them on xlsx and csv files. Everything runs in the browser; the files never leave it.
- Versions with an effective date for flows and reference tables.
- Accounts managed by an admin in the app: add a user, reset a password, lock and unlock. A new user changes the first
  password at the first sign-in.
- A light and a dark theme, and every text in a catalog with English and Vietnamese. The admin can edit any text in
  the app.
- Flow parameters: values that the user fills in on the Run screen (date, text, number, list, yes or no), read in
  formulas with `PARAM("key")`.

To put the app online, see `docs/DEPLOY.md` (a first deployment, and "Upgrade an existing deployment").

All data in `testcase/` and `design/` is sample data made for testing.
