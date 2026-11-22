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
| `design/harold/` | The Harold design system (tokens, brand book, components). Reference only |
| `design/screens-harold/` | The seven screens as built, in both themes. Reference only |
| `design/screens/` | The old target screens: structure and layout only |
| `testcase/` | Acceptance data and expected results. Read-only |

## What the app does

- Build flows from steps (input, column mapping, filter, formula column, lookup, group by, pivot, unpivot, append, SQL,
  output) on a canvas, and run them on xlsx and csv files. Everything runs in the browser; the files never leave it.
- Versions with an effective date for flows and reference tables.
- Accounts managed by an admin in the app: add a user, reset a password, lock and unlock. A new user changes the first
  password at the first sign-in.
- The look of the Harold design system: glass panels over a soft blue scene, a light and a dark theme (System uses dark when
  the browser has no preference), Be Vietnam Pro and JetBrains Mono as the fonts (part of the build, no font host), and the Harold
  icons. A status always has an icon and a word. Every text is in a catalog with English and Vietnamese. The admin can edit any text in
  the app.
- Reference tables: import a csv or xlsx file into a new table, a new version or a draft; adjust a draft (cells, rows,
  columns, description). A user reads the tables that their own flows read, read-only, with the flows that use them.
- Sign-out after inactivity, with the hours set by the admin (Admin, Settings), a warning two minutes before, and a note on
  the sign-in screen.
- The admin edits a text in English and Vietnamese together, with one Save.
- Panels that collapse to a rail: the sidebar, the step list and the settings panel of the builder, and the list of
  reference tables. The choice is kept in the browser.
- Flow parameters: values that the user fills in on the Run screen (date, text, number, list, yes or no), read in
  formulas with `PARAM("key")`.
- Steady dragging of steps on the canvas: a step never disappears while it is dragged, and a drag is one change.
- A Reference table step: a shared table as a step of its own, in the version that is valid on the date of the run. A date
  check warns when a table has no published version for some day of a flow version, in the publish dialog, under the step and
  on the Run screen.
- Parameters in the input boxes of every step (sheet name, header row, file name, and the like): the Test tab and the Run
  screen show the value that a run will use.
- Input files with a table inside a larger sheet: first and last column, where to stop (a footer word, an empty row, a fixed
  row), rows to ignore, and the columns that the file must have. "Analyze file" on the Test tab reads a sample file in the
  browser and proposes these settings with a confidence and a reason; nothing is applied until you press "Apply to the step".

To put the app online, see `docs/DEPLOY.md` (a first deployment, "Upgrade an existing deployment", "Upgrade from Phase 4", "Upgrade from Phase 5" and "Upgrade from Phase 6").

All data in `testcase/` and `design/` is sample data made for testing.
