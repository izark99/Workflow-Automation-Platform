# Data Flow Webapp: MVP specification

A free web app where about 10 colleagues build and run data-processing flows on
xlsx and csv files, inside the browser. Flows and shared reference tables carry
versions with an effective date range. The first target is a monthly timesheet
summary with overtime (OT) checks.

If this file and `testcase/TEST_RULES.md` disagree, `TEST_RULES.md` wins.

## 1. Decisions

| Topic | Decision |
| --- | --- |
| Users | About 10 colleagues, internal use |
| Screen | Laptop only, window width 1280 px or more. No mobile or tablet layout |
| Builder | Drag-and-drop node canvas |
| Execution | Manual run in the user's browser. Input files never leave the user's device |
| Versioning | Flows and reference tables both have versions. One effective date per run |
| Reference data | Shared rule tables live on the server. Files with personal data (timesheet, employee list) are uploaded for each run and stay local |
| File size | Up to the Excel sheet limit per uploaded sheet, subject to the spike result |
| Hosting | Cloudflare Pages (static files) and Supabase (Auth and Postgres), free tier |
| UI language | English is the built-in default. From Phase 4, every UI text is a key in one catalog; Vietnamese is a second language, and the admin can edit any text in the app (section 11.3) |
| Theme | Light, Dark and System, chosen by each user (section 11.4) |

## 2. Scope

**In scope**

- Canvas builder with 10 node types and one SQL node
- Input from xlsx and csv files. Output to xlsx (several sheets) or csv
- Data preview at every node (first 100 rows)
- Versions with an effective date range for flows and for reference tables
- Shared reference tables that hold rules, not personal data
- Personal flows, shared flows, and user groups
- Soft delete of flows with restore within 30 days
- Phase 4: admin account management, help text behind info buttons, editable texts in two languages, light and dark themes, flow parameters, UI quality pass (section 11)

**Out of scope for the MVP**

- Scheduled or triggered runs
- Storing input or output files on the server
- Connectors to APIs, databases, or email
- Effective dates on single rows inside a reference table
- Several people editing one flow at the same time
- An approval step before a version becomes effective
- Reference tables created by non-admin users
- Mobile and tablet layouts
- Self sign-up, password reset by email, email invitations (accounts are made by the admin, section 11.1)
- Deleting a user account for good (the admin locks it instead)
- Storing parameter values of a run anywhere (section 11.5)

## 3. Architecture

All data processing runs in the user's browser. The server stores only flow
definitions, versions, reference tables, users, groups, and run metadata.

| Part | Technology | Role |
| --- | --- | --- |
| App hosting | Cloudflare Pages | Serves static app files. No server-side processing |
| Canvas | React with React Flow | Drag-and-drop nodes, settings forms, step preview |
| Engine | DuckDB-WASM | Runs each node as a SQL query on local data |
| File reading and writing | SheetJS | Reads xlsx and csv, writes xlsx |
| Server | Supabase (Auth and Postgres) | Sign-in, definitions, versions, reference tables, access rules |

Free-tier limits that shape the design (checked 16 Nov 2026, re-check before launch):

| Service | Limit | Effect |
| --- | --- | --- |
| Supabase | 500 MB database per project. 1 GB file storage. Project paused after 1 week without activity. No automatic backups | Store definitions and small rule tables only. Add a daily keep-alive ping. Export a backup on a schedule |
| Cloudflare Workers and Pages Functions | 10 ms CPU per request. 128 MB memory. 100,000 requests per day | No file processing on the server |

## 4. Data model and versioning

Versioning works at the level of a whole version: each flow version and each
reference table version has `valid_from` and `valid_to`. The user picks one
effective date per run, and the app selects the versions valid on that date.

**Rules**

1. A flow has one or more versions. A reference table has one or more versions.
2. Versions of the same flow or table must not overlap. An empty `valid_to` means the version is still in effect.
3. A Lookup node points to a reference table, not to one version. The version is resolved at run time from the effective date.
4. If no version covers the effective date, the run stops with a clear message. The app never picks the nearest version.
5. A published version is read-only. A change means a new version, copied from the old one.
6. Publishing a new open-ended version sets `valid_to` of the previous open-ended version to the day before the new `valid_from`.

**Tables**

| Table | Key fields | Purpose |
| --- | --- | --- |
| `profiles` | id, name, role (`admin` or `user`) | One row per signed-in user |
| `groups`, `group_members` | group id, user id | User groups managed by the admin |
| `flows` | id, name, owner_id, scope (`personal` or `shared`), deleted_at | One row per flow |
| `flow_versions` | flow_id, version_no, valid_from, valid_to, status (`draft` or `published`), change_note, definition (JSON) | Nodes, edges, and settings of one version |
| `flow_group_access` | flow_id, group_id | Which groups can view and run a shared flow |
| `ref_tables` | id, name, description | One row per shared reference table |
| `ref_table_versions` | ref_table_id, version_no, valid_from, valid_to, status, columns (JSON), rows (JSON) | Content of one version. At most 50,000 rows |
| `run_log` | flow_version_id, user_id, effective_date, run_at, row counts, status | Run history. Metadata only, no input data, no parameter values |
| `profiles` (Phase 4 columns) | locked_at, must_change_password | Account lock and forced password change (section 11.1) |
| `ui_texts` (Phase 4) | locale, key, value, updated_by, updated_at | Admin edits of UI texts. No personal data (section 11.3) |

The `definition` JSON is the single source of truth for a flow. The canvas reads
and writes it, and the engine runs it.

## 5. Node catalog

Each node compiles to one SQL query over the nodes before it, and shows a
preview of its first 100 rows.

| Node | What it does | Main settings |
| --- | --- | --- |
| Input file | Loads one sheet of an xlsx file, or a csv file | Sheet, header row, rows to skip, fill down merged cells, add a row number column |
| Column mapping | Selects, renames, and types columns in one grid | One grid row per source column: keep or drop, new name, data type. The grid accepts a paste from Excel |
| Filter | Keeps rows that match a condition. Can send the other rows to a second output | Condition expression |
| Formula column | Adds or replaces a column from an expression | Column name, expression |
| Lookup / Join | Adds columns from a reference table or from another node | Source, key columns, columns to bring, behaviour when no match is found |
| Group by | Aggregates rows | Group columns, aggregations (sum, count, min, max, average) |
| Unpivot | Turns many columns into rows | Columns to keep, columns to unpivot, names for the new name and value columns |
| Pivot | Turns row values into columns | Row keys, column source, value, aggregation |
| Append | Stacks two or more inputs | Match columns by name or by position |
| Output | Writes the result to a file | File type, sheet name. Several Output nodes can write to one workbook |
| SQL | Runs free SQL on the nodes before it | SQL text |

## 6. Formula language

Formulas use Excel function names and work on the columns of the current row,
for example `IF([OT hours] > 4, "Over", "OK")`. Cell and range references such
as A1 or B2:B10 do not exist.

| Tier | When | Functions |
| --- | --- | --- |
| Tier 1 | MVP | Logic: IF, IFS, AND, OR, NOT, IFERROR, SWITCH, ISBLANK, ISNUMBER. Math: ROUND, ROUNDUP, ROUNDDOWN, INT, ABS, MOD, MIN, MAX, CEILING, FLOOR, POWER, SQRT, SUM. Text: LEFT, RIGHT, MID, LEN, TRIM, UPPER, LOWER, PROPER, CONCAT, TEXTJOIN, SUBSTITUTE, REPLACE, FIND, SEARCH, TEXT, VALUE. Date: DATE, YEAR, MONTH, DAY, WEEKDAY, WEEKNUM, ISOWEEKNUM, EOMONTH, EDATE, DATEDIF, DAYS, EFFECTIVE_DATE |
| Tier 2 | After the MVP | SUMIFS, COUNTIFS, AVERAGEIFS, MAXIFS, MINIFS, RANK, running totals, NETWORKDAYS and WORKDAY with a holiday reference table, regular expression functions |
| Not supported | Replaced by nodes | VLOOKUP, XLOOKUP, INDEX and MATCH: use the Lookup node. FILTER, SORT, UNIQUE: use the Filter and Group by nodes. OFFSET, INDIRECT, and other functions that need cell addresses |

`EFFECTIVE_DATE()` returns the effective date of the run. It replaces TODAY, so
that a run for a past period gives the same result every time. Each function is
translated to DuckDB SQL and has unit tests with the result Excel gives.

## 7. Permissions

| Object | Admin | Owner (user) | Group member | Other users |
| --- | --- | --- | --- | --- |
| Personal flow | Full rights | Full rights | No access | No access |
| Shared flow | Full rights | Not applicable. Only the admin creates shared flows | View and run | No access |
| Reference table | Full rights | Read | Read | Read |
| Users and groups | Full rights | No access | No access | No access |
| User accounts (create, reset password, lock, unlock) | Full rights, except locking themselves or the last active admin | Change own password | Change own password | Change own password |
| UI texts | Edit | Read | Read | Read (also before sign-in) |

- The admin can delete any flow. A user can delete a personal flow.
- A deleted flow is hidden, kept for 30 days, and can be restored by the admin.
- A user can copy a shared flow into a personal flow, then edit the copy.
- Every signed-in user can read every reference table.
- Row-level security in Postgres enforces all of this. The client is never trusted.

## 8. Limits and performance

The app accepts any sheet up to the Excel limit of 1,048,576 rows and 16,384
columns. Speed and memory at that size are unknown until the spike measures them.

| Test file | Format | Measure |
| --- | --- | --- |
| 100,000 rows x 40 columns | xlsx and csv | Load time, peak memory, time to run a group-by flow |
| 500,000 rows x 40 columns | xlsx and csv | Same |
| 1,048,576 rows x 40 columns | xlsx and csv | Same, and whether the browser tab survives |

Targets (proposals, not measurements):

- A 200,000-row xlsx file loads in under 30 seconds.
- A csv file at the full row limit loads without a crash.
- If xlsx at the full row limit fails, the app shows a warning and asks the user to save the sheet as csv.

## 9. Acceptance use case: monthly timesheet

The MVP passes when one flow definition turns the timesheet and the employee
list into a workbook that matches the expected workbook cell by cell, for both
datasets in `testcase/`. `testcase/TEST_RULES.md` holds the input layout, the 12
rules, and the test cases.

Flow outline:

1. Input file: load the timesheet (header on row 3), fill down Employee ID and Full name, keep the Row type column.
2. Unpivot the day columns into one row per employee, row type, and day.
3. Formula column: build the date from the day number and the month of the effective date.
4. Lookup: bring join date and leave date from the employee list.
5. Lookup: bring work-day value, day category, and OT type from the Attendance codes reference table.
6. Filter: send invalid rows to Exceptions with a reason.
7. Group by: total valid OT hours per employee per day, per ISO week, and per month.
8. Lookup and Formula column: compare the totals with OT types (day limit) and OT limits (week and month limit).
9. Pivot: one row per employee with day counts and OT hours per OT type.
10. Output: one workbook with the sheets Summary, Exceptions, and OT_breaches.

OT limits and attendance codes always come from reference tables, never from
fixed values in the flow.

## 10. Delivery phases

| Phase | Deliverable | Gate |
| --- | --- | --- |
| 0. Spike | Benchmark of DuckDB-WASM and xlsx reading with real-size files | Measurements recorded, reading strategy decided |
| 1. Engine | A flow defined in JSON runs the timesheet use case, no canvas yet | Output matches the expected workbooks of both datasets |
| 2. Canvas and screens | Seven screens from `docs/DESIGN.md`, working on a local data store | A user can build and run the timesheet flow in the browser |
| 3. Server | Supabase schema, row-level security, sign-in, versions, groups | Permission tests pass on a local Supabase |
| 4. Accounts, themes, texts, parameters | Section 11 | All gates of PROMPT section 2, including G6, pass in one clean run |

## 11. Phase 4 additions

Phase 4 adds seven things to the finished MVP. Everything in sections 1 to 10 still holds, and the acceptance flow
`flows/monthly-timesheet.flow.json` must still pass unchanged.

### 11.1 Account management by the admin

Today an admin makes accounts in the Supabase dashboard. Phase 4 moves this into the Admin screen.

| Action | Who | What happens |
| --- | --- | --- |
| Create account | Admin | Email, name, role, groups and a temporary password. The account is confirmed at once (no email is sent, so addresses such as `name@company.local` work). "Must change password at next sign-in" is on by default |
| Reset password | Admin | Sets a new temporary password for another user, with the same "must change" option. Existing sessions of that user end |
| Lock | Admin | The user cannot sign in, and a session that is still open loses all access at once (row-level security, not only the Auth ban). The profile and the user's flows stay |
| Unlock | Admin | Undoes a lock |
| Change own password | Every signed-in user | From the sidebar. Required right after sign-in when "must change password" is set; the app shows nothing else until it is done |

Rules:

1. The browser never holds the `service_role` key. Account actions run in one Supabase Edge Function, `admin-users`, that checks the caller's own token: the caller must have an active admin profile. The function uses the service role only inside the server.
2. An admin cannot lock themselves, and the last active admin cannot be locked or demoted.
3. Passwords: at least 10 characters. The Create and Reset dialogs offer "Generate", which makes a 16-character password the admin can copy once. The app never shows or stores a password after the dialog closes.
4. A locked user who signs in sees "Your account is locked. Ask your admin to unlock it." and nothing else.
5. Every action says what failed and what to do next, including "this email already has an account".
6. On the local store (no Supabase), the same screens work against an in-memory account service, so the e2e tests cover them.

### 11.2 Help text behind an info button

Explanations take space and make screens busy. From Phase 4 the visible text on a screen is limited to labels,
values, actions, errors, warnings that block an action, and the one line of an empty state. Everything that explains
moves behind an info button (i) next to the thing it explains:

- page subtitles: an (i) after the page title;
- field hints: an (i) after the field label;
- explanations in settings forms, dialogs and cards.

The info button is a toggletip: it opens on click, Enter or Space, and also shows on hover; Escape or a click outside
closes it; it is announced to screen readers; it never hides an error. Details are in `docs/DESIGN.md`.

### 11.3 Every text can be edited, in two languages

1. Every text the user can see comes from one message catalog with stable keys, for example `run.files.title`. This
   includes labels, buttons, help text, empty states, errors from the store and from sign-in, and engine errors. The
   engine stays free of UI code: it returns an error code with parameters, and the UI turns the code into text. An
   engine message without a key falls back to its English text.
2. Texts may hold named placeholders such as `{name}` or `{count}`. Plural forms use the form `{count, plural, one {# row} other {# rows}}`. An edited text must keep the same placeholders as the default; the editor refuses the change otherwise and says which placeholder is missing.
3. Built-in languages: English (`en`, the default and the fallback) and Vietnamese (`vi`). Each user picks a language in the sidebar; the choice is kept in the browser. A text that has no Vietnamese value falls back to English.
4. The admin edits texts on a new Admin tab, Texts: search by key or by text, filter by screen, pick the language, see the default next to the current value, edit, and reset to the default. Edits are stored in `ui_texts` and reach other users the next time they load the app, with no new deployment.
5. User data is never translated: flow names, column names, reference table content and file content are shown as they are.
6. Dates in the UI keep the form `30 Sep 2026`; month names come from the catalog, so Vietnamese shows them in Vietnamese.

### 11.4 Light, Dark and System themes

- Each user picks Light, Dark or System in the sidebar (and on the sign-in screen). System follows the operating system and changes live when it changes. The choice is kept in the browser and applied before the first paint, so the page never flashes the other theme.
- Both themes come from the same tokens (`docs/DESIGN.md`). Both meet the contrast rules of the Accessibility section.
- The canvas follows the app theme, never the operating system on its own. Today React Flow turns dark when the operating system is dark while the app stays light; that is a bug to fix (11.4 fix, task T4.3).

### 11.5 Flow parameters

A flow can ask the user for values before a run, on the same screen as the files: for example a period, a cut-off
date, a department code, or a yes/no switch.

1. A flow version holds a list of parameters in its definition. Each has a key (letters, digits, underscore; unique in the version), a label, a type, "required", an optional default, and help text (shown in an (i)).
2. Types: `date` (date picker), `text`, `number`, `list` (a dropdown of fixed options written in the parameter) and `boolean` (checkbox).
3. Formulas read a parameter with `PARAM("key")`. The type of the result is the type of the parameter. An unknown key is a syntax error that names the key. Parameters work in every place that takes a formula: Filter, Formula column, Output sort.
4. The SQL step sees the values as a one-row view named `params`, one column per key.
5. The Run screen shows a Parameters card next to the files. Each value is checked before the run starts (required, type, list option); the error sits under the field. The Test tab of the builder asks for test values the same way.
6. Parameter values stay in the browser like file content: they are not sent to the server and not written to `run_log`. They are not remembered between runs; the defaults of the definition fill the form.
7. A flow without parameters works as before. The definition format gets a new version number, and older definitions load with an empty list of parameters, so the acceptance flow file stays unchanged.
8. `EFFECTIVE_DATE()` stays a built-in value, not a parameter.

### 11.6 UI quality pass

A review of every screen in both themes against the checklist in `docs/DESIGN.md` ("UI quality checklist"), written
to `docs/UI_AUDIT.md` with one numbered finding per problem. Each finding becomes a small task. Findings that would
change the behaviour of a gate need a note in `docs/DECISIONS.md` first.

### 11.7 Gates for Phase 4

- G3 and G4 cover the new screens and both themes (`PROMPT.md`, section 2).
- G5 covers `locked_at`, `must_change_password`, `ui_texts` and their row-level security.
- G6 is new: `npm run test:functions` runs the `admin-users` Edge Function on a local Supabase.
- G1 must still pass with the unchanged acceptance flow.
