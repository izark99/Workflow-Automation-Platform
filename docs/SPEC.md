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
| Reference data | Shared rule tables live on the server. Files with personal data (timesheet, employee list) are uploaded for each run and stay local. From Phase 5 the admin imports, views and edits the tables, and a user sees the tables that their flows use (section 12.1) |
| File size | Up to the Excel sheet limit per uploaded sheet, subject to the spike result |
| Hosting | Cloudflare Pages (static files) and Supabase (Auth and Postgres), free tier |
| UI language | English is the built-in default. From Phase 4, every UI text is a key in one catalog; Vietnamese is a second language, and the admin can edit any text in the app (section 11.3) |
| Theme | Light, Dark and System, chosen by each user (section 11.4) |
| Session | From Phase 5 a signed-in user is signed out after a number of hours without activity, set by the admin (section 12.2) |
| Layout | From Phase 5 every side panel can be collapsed (section 12.4) |

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
- Phase 5: import of reference tables from xlsx and csv, reference tables visible to users by use, sign-out after inactivity, texts edited in both languages at once, collapsible panels (section 12)
- Phase 6: smooth dragging of steps on the canvas, input files with a table inside a larger sheet (a region, a stop rule, analysis of a sample file in the browser), every input box of a step that can take a parameter, and a Reference table step that puts a shared table on the canvas (section 13)
- Phase 8: faster building of a flow (auto arrange, align and distribute, adding a step after the selected one and connecting it, duplicating and copying steps), the preview in a large popup, and seven new steps: Sort, Remove duplicates, Top N, Split column, Clean text, Check and Compare (section 15)
- Phase 9: a print layout for the Output step (a header block, a table that repeats its header row, a signature block, page numbers, an xlsx that prints as it is), and reference tables that take their values from a column of another table, with a notice to the admin when new values appear (section 16)

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
- Storing a sample file, or any input file, on the server (section 13.2): the analysis of a sample file runs in the browser and only the settings it proposes are saved
- Formulas that read a reference table (LOOKUP, IN, and the like): a reference table is read by the Lookup and Pivot steps and, from Phase 6, by the Reference table step (section 13.3)
- Taking one value from a reference table into an input box, and a list parameter whose options come from a table (both can follow the Reference table step in a later phase)
- Headers of two or more rows, and more than one table read from one sheet by one Input step (section 13.2 lists the other tables that it finds)
- Undo and redo of every edit of the canvas (Phase 8 has one level, for Auto arrange only), a search box in the step list, and steps for date ranges, ranking and running totals (candidates for a later phase)
- PDF output, a company logo on a printed report, and email or push messages to the admin about new values of a linked table (Phase 9 prints through xlsx and tells the admin inside the app)

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
7. The first and the last day of a draft version can be changed at any time ("Edit dates"), and the first day is chosen when a flow or a reference table is made. The dates may not share a day with a published version (a published version with no end that starts earlier is fine: publishing ends it, rule 6). A published version keeps its dates (rule 5).

**Tables**

| Table | Key fields | Purpose |
| --- | --- | --- |
| `profiles` | id, name, role (`admin` or `user`), max_flows | One row per signed-in user. `max_flows` is the number of flows the user may own at one time (empty means no limit), set by the admin |
| `groups`, `group_members` | group id, user id | User groups managed by the admin |
| `flows` | id, name, owner_id, scope (`personal` or `shared`), deleted_at | One row per flow |
| `flow_versions` | flow_id, version_no, valid_from, valid_to, status (`draft` or `published`), change_note, definition (JSON) | Nodes, edges, and settings of one version |
| `flow_group_access` | flow_id, group_id | Which groups can view and run a shared flow |
| `ref_tables` | id, name, description | One row per shared reference table |
| `ref_table_versions` | ref_table_id, version_no, valid_from, valid_to, status, columns (JSON), rows (JSON) | Content of one version. At most 50,000 rows |
| `run_log` | flow_version_id, user_id, effective_date, run_at, row counts, status | Run history. Metadata only, no input data, no parameter values |
| `profiles` (Phase 4 columns) | locked_at, must_change_password | Account lock and forced password change (section 11.1) |
| `ui_texts` (Phase 4) | locale, key, value, updated_by, updated_at | Admin edits of UI texts. No personal data (section 11.3) |
| `app_settings` (Phase 5) | key, value (JSON), updated_by, updated_at | Settings that the admin sets for everyone. The first one is `idle_timeout_hours` (section 12.2) |
| `flow_ref_tables` (Phase 5) | flow_id, version_no, ref_table_name | Which reference tables a flow version uses (Lookup and Pivot steps). Kept by a trigger from the definition; it decides which tables a user may open (section 12.1) |

The `definition` JSON is the single source of truth for a flow. The canvas reads
and writes it, and the engine runs it.

## 5. Node catalog

Each node compiles to one SQL query over the nodes before it, and shows a
preview of its first 100 rows.

| Node | What it does | Main settings |
| --- | --- | --- |
| Input file | Loads one sheet of an xlsx file, or a csv file | Sheet, header row, rows to skip, fill down merged cells, add a row number column. From Phase 6: first and last column, a stop rule, rows to ignore, the columns the file must have (section 13.2) |
| Column mapping | Selects, renames, and types columns in one grid | One grid row per source column: keep or drop, new name, data type. The grid accepts a paste from Excel |
| Filter | Keeps rows that match a condition. Can send the other rows to a second output | Condition expression |
| Formula column | Adds or replaces a column from an expression | Column name, expression |
| Lookup / Join | Adds columns from a reference table or from another node | Source, key columns, columns to bring, behaviour when no match is found |
| Group by | Aggregates rows | Group columns, aggregations (sum, count, min, max, average) |
| Unpivot | Turns many columns into rows | Columns to keep, columns to unpivot, names for the new name and value columns |
| Pivot | Turns row values into columns | Row keys, column source, value, aggregation |
| Append | Stacks two or more inputs | Match columns by name or by position |
| Reference table | From Phase 6: puts a shared reference table on the canvas, the version valid on the effective date | Table |
| Output | Writes the result to a file | File type, sheet name. Several Output nodes can write to one workbook. From Phase 9 an xlsx sheet can have a print layout (section 16.1) |
| Sort | From Phase 8: puts the rows in an order | Columns, direction |
| Remove duplicates | From Phase 8: keeps one row of each group of equal rows. A second output holds the removed rows | Columns that decide, keep the first or the last |
| Top N | From Phase 8: keeps the first N rows, or the N largest or smallest, also per group | N, order column, direction, group columns |
| Split column | From Phase 8: cuts a text column into several columns | Column, how to cut, names of the new columns |
| Clean text | From Phase 8: tidies text columns | Columns, trim, spaces, case, remove Vietnamese marks |
| Check | From Phase 8: tests rules on every row. Rows that fail go to a second output with the rule and the message | Rules (a condition and a message) |
| Compare | From Phase 8: compares two tables by key: rows added, removed, changed | Key columns, columns to compare |
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
| Reference table: name and description | Full rights | Read | Read | Read |
| Reference table: delete | Full rights, only a table that no live flow reads (the message names the flows) | No access | No access | No access |
| Reference table: versions and rows | Full rights (import, edit a draft, publish) | Read, only the tables that a flow they can view or run uses | Same | No access |
| Users and groups | Full rights | No access | No access | No access |
| Number of flows a user may create (a limit per user) | Sets it for any user; has none themselves | Reads its effect only: a new flow or a copy is refused at the limit | Same | No access |
| User accounts (create, reset password, lock, unlock) | Full rights, except locking themselves or the last active admin | Change own password | Change own password | Change own password |
| UI texts | Edit | Read | Read | Read (also before sign-in) |
| App settings (idle sign-out) | Edit | Read | Read | Read |

- The admin can delete any flow. A user can delete a personal flow.
- A deleted flow is hidden, kept for 30 days, and can be restored by the admin.
- A user can copy a shared flow into a personal flow, then edit the copy.
- Every signed-in user can read the name and the description of every reference table, so the Lookup and Pivot steps can offer it. The versions and rows of a table are read only by the admin and by a user for whom a flow uses that table (section 12.1).
- The admin deletes a reference table from the "More" menu of the table, after a confirmation. The table goes for good with all of its versions. It is refused while a live flow reads it (flows point to a table by its name), and the message names the flows; a deleted flow does not count (migration 19, `delete_ref_table`).
- The admin sets, per user, how many flows that user may own at one time (Admin, Users, Edit, "Flows this user may create"; empty means no limit, 0 means none). A flow that is deleted does not count; an admin has no limit. A new flow and a copy of a shared flow are refused at the limit, with a message that says how to go on. The database enforces it with a trigger on `flows` (migration 20), so no path around the app can pass it.
- A person who is not the admin does not get the Admin screen: opening it sends them to the Flows list, with no message. The sidebar has no Admin link for them either.
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
| 5. Reference tables, idle sign-out, texts, panels | Section 12 | The same gates pass in one clean run |
| 6. Canvas drag, input regions, parameters in input boxes, Reference table step | Section 13 | The same gates pass in one clean run |
| 7. Harold design system | Section 14 | The same gates pass in one clean run, with no change to `src/engine/`, `src/store/`, `supabase/` and the flow file |
| 8. Faster building and more steps | Section 15 | The same gates pass in one clean run; the acceptance flow and `testcase/` are unchanged; no migration |
| 9. Print layout and linked reference tables | Section 16 | The same gates pass in one clean run, with migration 21 applied from zero; the acceptance flow and `testcase/` are unchanged |

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
4. The admin edits texts on a new Admin tab, Texts: search by key or by text, filter by screen, see the default next to the current value, edit, and reset to the default. (Phase 5, section 12.3, changes this: both languages are shown and edited together, with no language to pick.) Edits are stored in `ui_texts` and reach other users the next time they load the app, with no new deployment.
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
4. The SQL step sees the values as a one-row table named `params`, one column per key, next to its inputs `in1`, `in2` (decision D78).
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

## 12. Phase 5 additions

Phase 5 adds four things to the finished Phase 4 app. Everything in sections 1 to 11 still holds unless this section
changes it, and the acceptance flow `flows/monthly-timesheet.flow.json` must still pass unchanged.

### 12.1 Reference tables: import, view, adjust, and who sees what

**The admin** can, on the Reference tables screen:

1. **Import a file** into a table. The file is `.xlsx` or `.csv` and is read in the browser. The dialog has these steps: choose the file; for xlsx, choose the sheet; give the header row (default 1); see the first 20 rows; check the columns (the name comes from the header, the type is guessed from the first 1,000 filled cells as boolean, number, date or text, and the admin can change it); choose the target; Import.
2. The target is one of: **a new table** (name and description); **a new version of a table** (valid from, as for any new version); **the draft of a table**, which replaces the rows and columns of its existing draft (offered only when the table has a draft, and it asks first).
3. An import always makes a draft. It never publishes. The admin looks at the draft, adjusts it, and publishes it as today.
4. An import is refused, and nothing is saved, when: the file has more than 50,000 rows or more than 100 columns; a column name is empty or repeated (names are compared without regard to case); a cell does not fit the type of its column. The message names the first problems with row and column (for example "Row 14, column Limit: "abc" is not a number") and says what to do. Blank cells stay blank. Date cells of Excel and text such as `2026-09-30` are dates; other date text is an error that says to fix the file or to choose the type text.
5. **View**: any version, as a read-only grid with paging.
6. **Adjust a draft**: edit cells, add and remove rows, and add, rename, change the type of and remove columns. A published version stays read-only; a change is a new version (section 4, rule 5). The admin can change the description of a table. The name of a table cannot change, because flows point to it by name; to rename, create a new table.
7. The dialog says, behind an info button, that a reference table is shared with every user who has a flow that uses it, and so must not hold personal data.

**A user** sees, on the Reference tables screen, the tables that a flow uses for which the user may view or run that flow: their own personal flows, and shared flows of their groups. A table counts as used when any version of such a flow, draft or published, has a Lookup or Pivot step that points to it. The user opens its versions and rows read-only, and sees "Used by" with the names of those flows. A user sees no button that changes a table. When no flow of the user uses a table, the screen says so in its empty state. A deleted flow no longer counts.

The name and the description of every table are visible to every signed-in user, so the Lookup and Pivot steps can offer every table. A user who picks a table that no saved flow of theirs uses yet cannot open its rows until the flow is saved; the step says so.

Rules for the server: row-level security enforces all of this (section 7). `flow_ref_tables` is kept by a trigger on `flow_versions` and is filled once for the flows that exist.

### 12.2 Sign-out after inactivity

1. The admin sets "Sign out after (hours of no activity)" on a new Admin tab, Settings: a whole number from 1 to 72, default 8. It is stored in `app_settings` as `idle_timeout_hours`. Everyone signed in can read it; only an active admin can change it.
2. Activity is a pointer move or press, a key press, a scroll or wheel, a touch, and the window getting focus. The time of the last activity is kept in the browser (`localStorage`), written at most once every 5 seconds, so several tabs of the same browser share it. A flow run in progress counts as activity for as long as it runs.
3. 2 minutes before the limit a dialog says "You will be signed out in mm:ss because there was no activity", with "Stay signed in" (which counts as activity) and "Sign out now". When the builder or a reference table has unsaved changes, the dialog also says that they will be lost.
4. At the limit the app signs the user out in the browser and shows the sign-in screen with the quiet message "You were signed out after {hours} hours without activity." This is not an error. When the app is opened after the limit has already passed, the user is signed out at once with the same message.
5. The app reads the limit after sign-in and again every 15 minutes, so a new value reaches open sessions without a new sign-in.
6. The check runs in the browser. The sign-out removes the session from the browser; the access token that Supabase issued stays valid until it expires, at most one hour later, which `docs/DEPLOY.md` states under Limits.
7. On the local store (no Supabase) the same logic runs against the in-memory account service, so the e2e tests cover it. A development hook shortens the limit for tests.

### 12.3 Texts: both languages at once

The Admin tab Texts no longer asks for a language.

1. The table has the columns Key, English, Vietnamese and Actions. Each language cell shows the current text (two lines at most; the full text is read by screen readers and shown in the edit dialog) and a badge "Edited" when it differs from the default.
2. Filters: search (a key, or a text in either language), screen (the first part of the key), and "Edited only".
3. Edit opens one dialog with the key and two text areas side by side, English and Vietnamese, each with its default below it and a "Reset" for that language. One Save saves both; Ctrl+Enter also saves; Tab goes English, Vietnamese, Save.
4. Both texts are checked against the placeholders of their own default (section 11.3). If either text fails, nothing is saved, and the error sits under the text that failed. A text that equals its default is not stored.
5. The save is one action on the server: either both changes are stored or neither is.
6. "Reset both" in the dialog and in the row removes the edits of the key in both languages.

### 12.4 Collapsible panels

Every panel at the side of a screen can be collapsed to a narrow rail and opened again:

| Panel | Where | Open | Collapsed |
| --- | --- | --- | --- |
| Sidebar | Every screen except the builder | 232 px | 64 px rail |
| Step list | Builder, left | 184 px | 48 px rail |
| Settings panel | Builder, right | 380 px | 48 px rail |
| Table list | Reference tables, left | its width today | 48 px rail |

1. Each panel has a toggle button at its top (36 px, an icon, `aria-expanded`, an accessible name such as "Collapse sidebar" or "Expand settings panel"). The rail keeps the toggle.
2. The state of each panel is kept per user in the browser and applied before the first paint, so a reload does not flash the other state. Every panel starts open.
3. The sidebar rail shows the navigation as icons with the same accessible names, a "Create flow" button as an icon, and one user button that opens the same four controls as the open footer (language, theme, change password, sign out). Nothing that the open sidebar offers becomes unreachable.
4. The step list rail shows only the toggle: steps are added from the open list. The settings panel rail shows the toggle and, written upright, the name of the selected step. Clicking a step card on the canvas opens a collapsed settings panel, because it shows the intent to configure that step.
5. The content next to a collapsed panel takes the space. The canvas keeps the position of its steps, and "Fit to screen" uses the new size. The title and the first block of a screen keep their y (DESIGN, Layout).
6. A transition is at most 200 ms and does not run with `prefers-reduced-motion`.
7. The window is still at least 1280 px wide; collapsing is for room, not for a smaller window.

### 12.5 Gates for Phase 5

- G3 has the journeys of this section: an admin imports a csv and an xlsx file into a new table, a new version and a draft, and publishes; a user sees only the tables of their flows; a user is signed out after the limit (with a fake clock) and keeps the session when active; the admin changes the limit and it reaches an open session; the admin edits one text in both languages with one Save; every panel collapses, survives a reload and opens again.
- G4 checks every route in both themes with panels open, and the routes with each kind of panel collapsed (light at 1280 and 1440 px, dark at 1440 px), the new dialogs and the new tabs, with the pseudo-locale check on all of them.
- G5 covers `app_settings`, `flow_ref_tables` and the new row-level security on `ref_table_versions` (every cell of the permission table in section 7), and the function that saves two texts in one transaction.
- G6 and G1 are unchanged: `admin-users` still passes `npm run test:functions`, and the acceptance flow still passes untouched.

## 13. Phase 6 additions

Phase 6 adds three things to the finished Phase 5 app. Everything in sections 1 to 12 still holds unless this section
changes it, and the acceptance flow `flows/monthly-timesheet.flow.json` must still pass unchanged (its definition keeps
`schemaVersion` 1 and is not edited).

### 13.1 Dragging steps on the canvas

Dragging a step card on the canvas is jerky today, and a card can disappear while it is dragged. The cause is not known
yet: the first task measures it. The requirements are about what the user sees:

1. A step never disappears: during a drag and after the drop, every step of the flow is in the page, visible, and at the
   position the user left it (or where React Flow panned it to, when the drag reached the edge of the canvas).
2. A drag is smooth: in headless Chromium at 1440 x 900, with 12 steps, the 95th percentile of the time between two
   frames while a card is dragged is at most 33 ms, and with 60 steps at most 50 ms (a measured budget; T6.2 records the
   numbers it reached and the test keeps them).
3. One drag is one change: the position is written to the flow definition when the card is dropped, not on every pointer
   move. The "unsaved changes" state turns on once, and the settings panel, the step list and the other cards do not render
   again during a drag.
4. The edges follow the card during the drag. The selection is kept. A published (read-only) version cannot be dragged.
5. The same holds with each panel open and collapsed, and for a step that is dragged in from the step list.

### 13.2 Input files that hold a table inside a larger sheet

A file exported from another system often has a title block above the table, the table inside one part of the sheet, and
a footer under it (totals, signatures, a date and place). Today the Input step has only a header row, rows to skip and
fill down. From Phase 6:

1. **A region.** The Input step can read only the table: from the header row down, from a first column to a last column,
   up to a stop rule. The stop rule is one of: the end of the sheet (the default, as today); the first row that is empty
   in the whole region (or the first N empty rows in a row, N from 1 to 10); the first row where a chosen column (or any
   column) contains, starts with or equals a text, such as "Prepared by" or "Signature" (not case sensitive, and the row
   itself is not read); a fixed last row. A list of rows to ignore can name a column and a text, for example subtotal rows.
   Rows above the header row and below the stop rule are never loaded, so a text in the footer cannot break a column type.
2. **The columns the file must have.** The step can list the column names that the file must contain (case does not
   matter, order does not matter, other columns are allowed). When the file lacks one, the run stops before any step runs and
   says which are missing and which columns the file has instead. A step without the list works as today.
3. **Analyze a sample file.** In the builder, on the Test tab of an Input step, where the person chooses a test file, a
   button "Analyze file" reads the file in the browser and proposes: the sheet (when the first sheet holds no table, the sheet
   with the largest table), the header row, the first and last column, a stop rule, the columns the file must have, and the
   columns that look like merged cells (to fill down). Each proposal has a confidence (high, medium, low) and a reason that
   is shown behind an info button. The analysis also lists the areas that it leaves out (title rows, footer rows) and any other
   tables that it found in the sheet, with their rows and columns, so the person sees what is not read.
4. The proposal is never applied by itself. The person looks at a preview of the sheet with the region marked and the other
   rows dimmed, changes what is wrong, and presses "Apply to the step", which fills the Configure tab. Anything that the
   analysis cannot decide is left empty and said so; a wrong guess that nobody sees is worse than no guess.
5. The sample file stays in the browser, like every input file (section 3). The analysis sends no request that carries file
   content, and no file is stored on the server: only the settings of the step are saved with the flow. Anyone who can edit the
   flow can analyze a file; it is not an admin feature.
6. The analysis reads at most 2,000 rows and 100 columns of one sheet and finishes in under 2 seconds on the benchmark file
   of 2,000 rows. It uses no data of the test files in the repository: the words that mark a footer ("Prepared by",
   "Signature", "Người lập", "Ký tên", and similar) are a short list of generic words in English and Vietnamese kept in one
   module, never an employee ID, a name or a number of the acceptance data.
7. The region applies to xlsx and csv alike. A csv file has no sheets; its columns are numbered. The result is the same table
   whichever way the file is read (the streaming xlsx reader or DuckDB `read_csv`).

### 13.3 Parameters in every input box, and the Reference table step

Parameters (section 11.5) are defined as today, in the Parameters panel on the right of the builder; nothing about that panel
changes. They work in formulas only. From Phase 6 they also work in the input boxes of every step, and a shared reference table
can be put on the canvas like any other step.

**Parameters in the input boxes**

1. A single-value setting can take a parameter. In the flow definition `{"$param": "period"}` replaces the literal value. The
   definition format gets `schemaVersion` 3; older definitions load unchanged and the acceptance flow is not edited.
2. **Which settings.** Every single-value setting of every step: a text, a number, a date, a yes/no switch, and a dropdown of
   fixed choices (for example the Input step's sheet and header row, the Output step's file name, the Pivot step's fill value,
   the Unpivot step's new column names, the Lookup step's behaviour when nothing matches). Not: the choice of a column of the
   data, the rows of a list or a grid (Column mapping rows, Group by aggregations, Lookup keys), and formulas and SQL, which read
   parameters with `PARAM("key")` and the table `params` (section 11.5). One registry module lists the settings with their type,
   and a test fails when a setting of a step form is neither in the registry nor in its short list of exclusions, so a new
   setting cannot be forgotten.
3. **Types.** A parameter fits a setting of the same type; a `list` parameter fits a text setting; for a dropdown of fixed
   choices the value must be one of its choices (checked before the run, with the choices named). A parameter that is blank
   and optional leaves an optional setting unset; for a required setting it is an error that names the step and the setting.
4. **Resolved before the run.** The engine replaces every binding by the value of its parameter before a step is compiled, so
   the step modules see plain values and do not change. The Test tab (with its test parameter values) and the Run screen show
   the resolved value next to the setting ("Now: Sheet1"), so the person sees what will be used. Values stay in the browser
   (section 11.5 item 6).

**The Reference table step**

5. A new step, "Reference table", is one entry of the step list (not one per table). It is added to the canvas like any other
   step (dragged in, or with its button). It has no input and one output. The table is chosen afterwards, in the Configure tab,
   from a dropdown of every table name (as the Lookup step offers them). The step loads all columns and rows of the table.
6. **Version and date.** The step uses the version of the table that is valid on the effective date of the run, which is the same
   effective date that selects the flow version, with the same rule and the same engine functions as the Lookup step (section 4).
   The Run screen lists the table and its version with the other versions used; the Test tab shows the version used for its test
   date ("v2, from 01 Jul 2026 to 31 Dec 2026"). When no version covers the date, or versions overlap, the run stops with the
   existing message that says which table and which date.
7. **The date check.** Before a flow version is published, and on the Reference table step, the app checks the whole range of the
   flow version (its start and end dates) against the published versions of each table that the flow reads. A day with no version
   of a table is shown as a warning that names the table and the days ("OT limits has no published version from 01 Jan 2027 to
   30 Jun 2027: a run for these dates will stop"). The warning does not block the publish, because the admin may add the table
   version next. The same function serves the step, the publish dialog and the Run screen.
8. **Connecting it.** Its output connects to any step that takes a table: the right input of Lookup and Join, Append, Pivot,
   SQL. The "Reference table" source that the Lookup step already offers stays, so flows made before Phase 6 run unchanged.
9. **Who reads which table (section 12.1) follows.** A Reference table step counts as reading its table: `flow_ref_tables`
   lists it, so a person who may run the flow can read the rows. The database function that fills `flow_ref_tables` and
   `referencedTables()` of the engine give the same answer for the same definition, with this step included; a test keeps them
   together (migration 18). Until the flow is saved the table is not readable for a person who does not yet have a flow that
   reads it, and the step says "Save the flow to read this table", as the Lookup step does.
10. A flow without parameters in input boxes and without the step works as before.

### 13.4 Gates for Phase 6

- G1 adds the layouts: a generated set of files with a title block, a table inside the sheet, a footer, merged title cells,
  more than one table in a sheet, a header on a later row, and the same as csv, each run through the real engine in Chromium
  with the settings of its region and compared to the expected rows cell by cell. The generator is a script of the repository
  (never `testcase/`); a second set runs the analysis and expects it to find the region of each clear layout and to report low
  confidence on the ambiguous ones. A flow with a Reference table step runs with the table version of the effective date (two
  versions, two dates), and a flow whose Input step takes its sheet and header row from parameters runs. The two acceptance
  datasets still pass with the same flow file.
- G2 has unit tests for the region and the stop rules, the columns the file must have, the analysis, the parameter bindings, the
  registry of settings that take a parameter, the Reference table step and the date check.
- G3 has the journeys of this section: dragging steps (the budgets of 13.1, no step disappears, one drag is one change); an
  Input step is set up from a sample file with Analyze file and runs; settings of several steps take a parameter and the Test tab and
  the Run screen show the resolved values; a Reference table step is dragged in, a table is chosen, and it feeds a Lookup and an
  Append; the date check warns about a gap; a file that lacks a required column stops with the message; the analysis sends no
  request with file content.
- G4 checks every new route in both themes (light at 1280 and 1440 px, dark at 1440 px) with the pseudo-locale check: the parameter
  control and a field that uses a parameter, the Reference table step and its states, the date check warning, the analysis
  panel in each state, the region preview, the run messages.
- G5 covers migration 18 (the function that lists the tables a definition reads, now with the Reference table step, the trigger,
  the backfill) with the parity cases of the engine, and `ref_table_versions` access for a table that a flow reads only through
  the Reference table step.
- G6 (`admin-users`) and G0 (the spike) are unchanged.

## 14. Phase 7 additions

Phase 7 changes how the whole app looks, and nothing else. It adds no feature, no setting, no table, no migration, and it
does not change the engine, the flow definition, the data stores, the wording of any text or any behaviour. Everything in
sections 1 to 13 still holds, the acceptance flow `flows/monthly-timesheet.flow.json` is not edited, and the budgets of
section 13.1 (dragging steps) still hold. Requirement 1 is below; more requirements of the same kind are added as 14.x.

The visual authority is the design system "Harold" (Spatial), kept in this repository as a snapshot in `design/harold/`
(`design/harold/SOURCE.md` says where it came from). Where it disagrees with `design/screens/` (the teal look of Phases 2
to 6), Harold wins. `docs/DESIGN.md` ("Harold design system (Phase 7)") records the exact values and what replaces each old rule.

### 14.1 The look

1. Glass panels over a soft blue scene, in the style of visionOS: a translucent panel with blur, a lit top edge and a soft
   shadow. The scene is the only gradient of the app. Dark and light are both Harold themes, and both hold the same
   contrast targets.
2. One blue (`primary` as a fill, `primary-text` as text and line). The warm second hue (Ember, `accent`) appears at most
   once per screen and never means a warning or an error. The orange call-to-action button of Phases 2 to 6 is gone: the
   one main action of a screen is the one `primary` button.
3. Type is Be Vietnam Pro, with full Vietnamese support, and JetBrains Mono for formulas and code. Both are served by the
   app itself (no font request to another address). Vietnamese marks never clip: text styles keep the line heights of the
   Harold type table.
4. Shape: radii of 8, 14, 22 and 32 px and pills. Controls have fixed heights of 32 and 40 px, no outline on buttons,
   and an outline of `border-strong` on inputs. Spacing uses only 4, 8, 12, 16, 24, 32, 48 and 64 px.
5. Icons are the 47 Lucide icons of Harold, drawn in `currentColor`.

### 14.2 Tokens and themes

1. `src/ui/tokens.css` holds the Harold tokens of `design/harold/tokens.json`, with the same names and values, for both
   themes. A test reads the snapshot and fails when the two differ. No raw colour, radius, shadow or blur value exists
   outside `tokens.css`.
2. The tokens of Phases 2 to 6 (`--color-bg`, `--color-card`, `--color-cta`, ...) are replaced. While the app is being
   moved they may exist as aliases that point to Harold tokens; at the end of the phase no alias and no use of an old name
   is left, and a test fails if one comes back.
3. The Light, Dark and System choice of Phase 4 stays. System follows the operating system; when the browser reports no
   preference the app uses dark (Harold's default).
4. Contrast is tested, not assumed. A unit test composites every translucent surface over the scene (the lightest part
   of it) and checks every text and ground pair of both themes at 4.5:1 (3:1 for control borders, focus rings and
   icons that carry meaning). If a Harold value fails its own target, the test records the pair and the build asks
   Harold under "Needs Harold" instead of changing the value.
5. React Flow takes its colours from the tokens (dots, edges, handles, selection, controls) in both themes.

### 14.3 Glass, and what it must not cost

1. A glass panel is: translucent fill, `blur-md` with `saturate(1.5)`, a 1 px `border` and `shadow-sm`. Menus, selects, date
   pickers, dialogs, toasts and sticky table headers use `surface-overlay` (nearly opaque). A panel inside a panel uses the
   inset tint, not a second blur.
2. No limit on glass: Harold's recipe may be used on any surface, in any number, including tables, grids, the step cards and
   the controls of the canvas. Two things still hold. A blurred element does not change size by animation (the width of a
   collapsing panel keeps its 200 ms and the panel has no blur while it moves, 14.4). And the one safeguard is the drag budget:
   if blur makes a drag test of 13.1 fail, the build removes the blur from the element that causes it (the `surface-overlay`
   fill stays), records which element and why in `docs/DECISIONS.md`, and does not loosen the budget.
3. Text on glass keeps its contrast (14.2 item 4). Long reading and long forms may use `surface-overlay` where the contrast
   test or the review shows that glass hurts them; that is a choice per surface, not a rule.
4. Fallbacks: without `backdrop-filter`, and under `prefers-reduced-transparency`, glass panels switch to
   `surface-overlay` with no blur.
5. Dragging a step is as smooth as before: the tests of 13.1 pass unchanged on the new look (`e2e/canvas-drag.spec.ts`
   keeps its budgets and its numbers; `npm run perf:canvas` is run again and its report replaced).

### 14.4 Controls, layout and states

1. Every component of the app is restyled to its Harold counterpart: button and icon button (primary, secondary, ghost,
   danger; sizes 32 and 40 px), text field, dropdown, date picker, checkbox, search field, tabs and filter chips,
   dialog, menu, info button and its popover, toast, badge, card, table, skeleton, empty state, error and warning
   messages (the Harold alert), progress bar, pagination, breadcrumbs, sidebar, page header. The behaviour and the keyboard
   keys of each stay as they are.
2. Page structure: the 240 px sidebar (a 64 px rail when collapsed, SPEC 12.4), a 64 px page header with breadcrumbs, the
   title with its info button and the actions, content up to 1200 px wide. The builder keeps its panel widths (184, 380 and
   the 48 px rails) and its 240 x 56 px step cards; only their look changes. The minimum window width stays 1280 px.
3. Tables: header 40 px, rows 44 px plus a 1 px divider (dense 36 px), numbers right-aligned in tabular figures, status
   always a word or an icon with a colour.
4. Focus: a 2 px `primary-text` ring with a 2 px gap in the scene colour on every interactive element, in both themes.
5. Motion: 120 ms for hover, press and toggles, 200 ms for menus and popovers, 260 ms for dialogs, closing about two
   thirds of that; only opacity and transform move; none with `prefers-reduced-motion`. The one exception is the width
   of a collapsing panel (Phase 5): it keeps its 200 ms and the panel has no blur while it moves.
6. Loading, empty and error states keep their rules (DESIGN "Loading, empty, and error states"): skeleton in the final
   layout after 300 ms, an empty state with one action, an error that says what failed and what to do.
7. The patterns that Harold names under "Avoid" are not used: a gradient other than the scene, gradient text, a glow around
   a component, a card with a coloured stripe on one side, emoji, an icon in a coloured circle above a card title.

### 14.5 What does not change

- Every flow, run, version, permission, reference table and text behaves as before; the catalog keys and both languages stay.
- Dates stay `30 Sep 2026` and numbers keep their current format in every language (Harold's Vietnamese formats
  `20/11/2026` and `3.024` are a later phase, see "Needs Harold").
- The parts of Harold made for phones and for charts (app bar, bottom navigation, sheet, list item, KPI tile, avatar,
  chart colours) are not used: the app is for laptops, 1280 px and wider.
- `src/engine/`, `src/store/`, `supabase/` and the flow file have no change at all.

### 14.6 Gates for Phase 7

- G1, G5 and G6 are unchanged and must still pass. A search of the diff against `main` finds no change in `src/engine/`,
  `src/store/`, `supabase/` or `flows/`.
- G2 has the token parity test, the contrast test with composited surfaces, a test that no old token name or raw colour is
  left, the icon set test (every icon the app uses is in the set) and the font test (the families load from the app's own
  files).
- G3 passes unchanged: every journey of Phases 2 to 6, the drag budgets included. A selector may change only when the
  markup changed on purpose, and the log says which. New: the three themes show every journey's key screen readable
  (Light, Dark, System with no preference), the fallbacks without blur render, the Vietnamese sample text is not clipped,
  and a run sends no request to a font or script host.
- G4 holds the Harold rules on every route in light at 1280 and 1440 px and in dark at 1440 px, with the pseudo-locale check:
  button heights 32 and 40 px (and the 24 px info button), one `primary` button per screen, table rows 45 px, sidebar 240
  or 64 px, no gradient except the scene, no coloured stripe on one side of a
  card, font sizes only from the Harold scale, the 4 px spacing scale of 14.1, the focus ring, and axe.
- The Pages build (`npm run build:pages`) stays under its size limit with the fonts, and `npm run test:acceptance:pages` passes.

## 15. Phase 8 additions

Phase 8 makes a flow faster to build and adds seven steps. It has no server part: no migration, no change to `src/store/`
or `supabase/`, and `DataStore` is unchanged. Everything in sections 1 to 14 still holds. The acceptance flow
`flows/monthly-timesheet.flow.json` is not edited and keeps `schemaVersion` 1, and `testcase/` is not read or changed. The
drag budgets of section 13.1 still hold.

### 15.1 Auto arrange, align and distribute

1. A button "Auto arrange" in the canvas controls puts the steps in order. With no selection, or one step selected, it
   arranges the whole flow. With two or more steps selected it arranges only those, and keeps the top left corner of
   their bounding box where it is.
2. The layout runs from left to right. A step is in the column after the last of its inputs (the longest path from a step
   with no input). Inside a column the steps are ordered to reduce crossing edges (the average row of their neighbours),
   with the `match` output of a Filter above its `nomatch` output. The gap between columns is 80 px and between steps in a
   column 40 px, the columns are centred on one horizontal axis, and flows that are not connected to each other are stacked
   with 120 px between them. The result depends only on the flow: arranging twice gives the same positions.
3. Arranging is one change of the flow definition (the "unsaved changes" state turns on once). The view is fitted to the
   result. A toast says "Steps arranged" and has "Undo", which puts every position back; it goes away with the next change.
   A published (read-only) version cannot be arranged: the button is disabled.
4. With two or more steps selected, a small toolbar offers Align left, centre, right, top, middle and bottom, and with three
   or more Distribute horizontally and vertically (equal gaps between the edges of the cards, the two outermost steps stay).
   Each is one change. A switch "Snap to grid" (8 px) is kept per user in the browser and is off by default.

### 15.2 Adding steps faster

1. When exactly one step is selected and it has a free output, adding a step (a click on its button, Enter or Space on it)
   puts the new step to the right of the selected one, on the same row or the first free place, and connects the selected
   step to the first input of the new step that is free and required (Lookup and Join: the left input; Append: the first).
   A Filter connects through `match`. Nothing is connected when the new step has no input (Input file, Reference table),
   when the selected step has no free output (Output) or when no input of the new step fits. With no selection, or with
   several steps selected, a step is added as before.
2. A step dragged from the step list and dropped on an edge goes between the two steps: the edge is split into source to new
   step and new step to target. When the new step cannot take the source or give the target (no input, no output, a second
   input that is required) it is added without touching the edge.
3. Ctrl+D (Cmd+D on a Mac) duplicates the selected steps; Ctrl+C and Ctrl+V copy and paste them. A "Duplicate" button is also
   in the settings panel for a selected step. The copy keeps the settings, bound parameters and the name with " (copy)" added.
   The key of an Input file step is made unique ("Main 2") because a key stands for one test file and one file of a run. Edges
   between copied steps are copied; edges to steps that are not copied are not. The copy is offset by 40 px. Pasting works in
   another version or another flow of the same tab (the clipboard is in memory, it is gone on reload and it is not sent
   anywhere). Each action is one change. A read-only version cannot be pasted into. The keys do not act while a text field has focus.

### 15.3 The preview in a large popup

1. The Test tab preview has an "Expand" button that opens the same rows in a large dialog (up to 90% of the window in each
   direction, at least 960 x 560 px) with a header row that stays in place while the rows scroll, a first column of row
   numbers, and a vertical and a horizontal scroll bar.
2. The popup has "First rows" and "Last rows" (the two previews of item 3), a "Find" box that
   keeps the rows whose text contains the typed text (not case sensitive, in the rows that are loaded) and says how many
   rows match, and "Show more", which runs the preview again with up to 1,000 rows. The message under the table says how many
   rows of how many are shown. Escape closes the popup and the focus goes back to the Expand button.
3. The Test tab has "Preview last rows" next to "Preview first rows" (already built after Phase 7, kept): it shows the last 100 rows to
   check how the end of a file was read. The popup uses both. The numbers of the rows are those of the whole table.
4. The popup shows data in the browser only. A preview sends no request that carries file content, as before.

### 15.4 New steps

Each new step is one node type with its module in `src/engine/nodes/`, its settings in the JSON schema, validation with a
clear message, unit tests, a card, a Configure form, a Test tab, help behind an info button, catalog keys in English and
Vietnamese, and an icon of the Harold set. Single-value settings take a parameter (section 13.3). A flow that holds one of
these steps has `schemaVersion` 4; older definitions (1 to 3) load unchanged, and the acceptance flow stays at 1. The step list has three new groups:
Rows (Sort, Remove duplicates, Top N), Text (Split column, Clean text) and Quality (Check, Compare).

1. **Sort.** One input, one output. A list of keys, each a column (or a formula) with a direction; empty values go last. The
   row order is kept by the steps that work row by row (Filter, Column mapping, Formula column, Split column, Clean text,
   Top N, Check) and is not promised after Group by, Pivot, Unpivot and Append, so a Sort is placed before the step that
   needs the order (Top N, Remove duplicates with "keep first", Output).
2. **Remove duplicates.** One input, outputs `kept` and `removed`. The columns that decide (all columns by default) and
   "keep the first" or "keep the last" of the rows in their current order. Empty values equal each other. `kept` keeps the
   order of the input.
3. **Top N.** One input, one output. N (a whole number from 1 to 1,000,000; it takes a parameter), "by" a column or formula
   with largest or smallest first, or "first rows in the current order", and optional group columns ("the 3 largest per
   department"). Rows with equal values at the limit are cut by their order in the input (no ties kept), and the result is
   sorted by the order column within each group.
4. **Split column.** One input, one output. A text column, and how to cut: at every comma, semicolon, space, tab, or a
   given text; at the first space; or at the last space (a full name into the family and middle names and the given name,
   the usual cut of a Vietnamese name). The names of the new columns, how many parts there are, "put the rest in the last
   part" or "drop the rest", trim each part, and keep or drop the original column. A part that is missing is empty. A new
   name that already exists is an error that says which.
5. **Clean text.** One input, one output. The columns to clean (text columns) and any of: trim the ends, collapse runs of
   spaces to one, remove characters that do not print (line breaks, tabs, non-breaking spaces become a space), UPPER, lower or Proper Case,
   and remove Vietnamese marks (the base letter, with `đ` and `Đ` as `d` and `D`). The result replaces the column, or is
   written to a new column named by adding a suffix.
6. **Check.** One input, outputs `ok` and `errors`. A list of rules; a rule has a name, a condition (a Tier 1 formula that
   is true when the row is fine) and a message. `ok` holds the rows that pass every rule, in order. `errors` holds the
   input columns plus `Rule` and `Message`, one row for every rule that a row fails, so a row that fails two rules appears
   twice. A condition that is empty or null for a row counts as a fail. A setting "Stop the run when a rule fails" is off
   by default; when it is on, a run with at least one error stops with the number of failures per rule. The Test tab and the
   Run screen say how many rows failed each rule.
7. **Compare.** Two inputs, `new` and `old`, and outputs `added` (keys only in new), `removed` (keys only in old) and
   `changed` (keys in both with at least one compared column different). One or more key columns (they must be unique in
   each input: a repeated key stops the run and names it) and the columns to compare (the columns both inputs have, except
   the keys, by default). `changed` holds the keys, the column `Changed columns` (the names, joined by a comma) and for each
   compared column its new value and its old value (`Hours` and `Hours (old)`). Values are compared as the typed values
   (number to number, date to date; empty equals empty).

### 15.5 What does not change

- No server part: no migration, no change to the stores or to `supabase/`, no new function; a deployment on Phase 7 needs only the new app files.
- Existing flows load and run unchanged; a flow without the new steps keeps its `schemaVersion`.
- The acceptance flow, both datasets and the expected workbooks, the drag budgets of section 13.1 and the privacy rule (no
  request carries file content) hold.
- Dates, numbers and the look follow Phases 6 and 7. The new controls use the Harold tokens and icons only.

### 15.6 Gates for Phase 8

- G1 adds a generated flow for each new step, run through the real engine in Chromium and compared to expected rows computed
  in the test by a plain loop (never from `testcase/`), including empty values, Vietnamese text, a repeated key and ties; the
  two acceptance datasets still pass with the same flow file.
- G2 has unit tests for the arrange layout (order, spacing, idempotence, filter outputs, disconnected flows, a selection, align
  and distribute), the connection rules of 15.2, the copy rules (unique keys, edges), and every new node (settings
  validation, SQL, the cases above), plus the catalog test (every key in both languages, every icon in the Harold set).
- G3 has the journeys of this section: Auto arrange on a messy flow (and Undo); align and distribute; adding steps after the
  selected one builds a connected flow without a drag; a step dropped on an edge; duplicate, copy and paste into another flow;
  the preview popup (first and last rows, Find, Show more up to 1,000 rows, Escape); one run through each new step; and the
  drag budgets, which stay as they are.
- G4 checks every new route and state in both themes (light at 1280 and 1440 px, dark at 1440 px) with the pseudo-locale
  check: the canvas controls and the selection toolbar, the popup, and the card and form of each new step.
- G5 and G6 are unchanged; `test:db` still applies the migrations 1 to 20 from zero.

## 16. Phase 9 additions

Phase 9 adds a print layout to the Output step and reference tables that take their values from another table. It adds one
migration, number 21, and one dependency (ExcelJS, used only when a print layout is on). Everything in sections 1 to 15
still holds, the acceptance flow `flows/monthly-timesheet.flow.json` is not edited (it has no print layout, so it is written
as before), and `testcase/` is not read or changed.

### 16.1 A print layout for the Output step

The Output step can write an xlsx sheet that prints as it is: a header block, the table with its header row on every page,
a signature block at the end and page numbers. It is for reports; the default is off, and with it off the step writes the
file exactly as before.

1. **Switch.** The Configure tab of an Output step (format xlsx) has a group "Print layout" with a switch, off by default.
   With the format csv the group is not shown. Several Output steps can write one workbook: each sheet has its own print
   layout; a workbook with at least one print layout is written by ExcelJS (loaded only then, as a separate file of the
   build), and a workbook without one is written as before.
2. **Page.** Paper A4 (default), A3 or Letter; portrait (default) or landscape; margins normal, narrow or wide; "fit all
   columns on one page wide" (on by default, the height is free). The table header row repeats at the top of every page.
   Gridlines are not printed. The print area is the header block, the table and the signature block.
3. **Table.** Thin borders on every cell, a bold header row on a light fill, numbers right aligned, dates as dates, text as text,
   column widths from the content (at least 8 and at most 50 characters), long text wrapped. The values are those of the
   normal file: reading the table back gives the same cells as the file without a print layout.
4. **Header block.** Up to 6 lines above the table, on the first page: the company name, the name of the report, the period,
   and so on. A line has its text, its alignment (left, centre, right), bold, and a size (normal, large, extra large). It
   is merged across the width of the table. A line can hold these tokens, which are replaced when the file is written:
   `{effective_date}` (the effective date as `30/09/2026`), `{month_year}` (`09/2026`), `{run_date}` (the day of the run,
   `dd/mm/yyyy`), `{flow}` (the name of the flow), `{rows}` (the number of rows of the table), and `{param:key}` (the value of a
   parameter, as text). An unknown token or a parameter that does not exist is a validation error that names it.
5. **Signature block.** At the end of the report, directly after the last row on the last page: an optional line on the right
   (for example `Hà Nội, ngày {day} tháng {month} năm {year}` with the tokens `{day}`, `{month}` and `{year}` of the run date),
   then 1 to 5 signers side by side in equal columns: a title in bold ("Người lập biểu"), a line in italics under it ("(Ký,
   ghi rõ họ tên)"), a space of four rows to sign, and an optional name. If the block would not fit on what is left of
   the last page, a page break is put before it, so the block is never cut in two. (The number of rows of a page is estimated from the paper, the
   orientation and the row height; the check is a rule of the writer, tested on the estimate.)
6. **Page numbers.** "Trang 1/5" in the middle of the footer of every page (a switch, on by default). It follows the language of the app: "Page 1/5" when the app is in English.
7. **Size.** A print layout is for reports of up to 20,000 rows; a larger table is refused with a message that says to turn the
   layout off. T9.1 measures the time and the memory and can lower the limit.
8. **Print preview.** The Test tab of an Output step with a print layout shows the first page and the last page drawn from the
   settings and the first and last rows of the preview (the header block, the header row, a few rows, the signature block, the
   footer), marked as approximate: the page breaks in the middle are Excel's. It can be opened in the large popup of 15.3.
9. **Privacy.** The file is made in the browser. The ExcelJS file is a static asset, and no request carries file content.
   A file with no layout is written as before, byte for byte. When one xlsx file holds a sheet with a layout and a sheet without, the whole
   file is written by ExcelJS: the plain sheet has the same cells and the table style of the writer (D137).

### 16.2 Reference tables that take their values from another table

A table B can take the distinct values of one column of a table A as its key column. The admin then fills the other columns of B.
When new values appear in A, B gets them without anyone typing, and the admin is told.

1. **Link.** An admin links B to A: "Link to a table" in the More menu of B, or "Take the values from a column of another table"
   when a table is made. The admin chooses A, the column of A (`c`), and the key column of B that holds the values (it is added
   as the first column if it does not exist). A table has at most one link as B, and A can feed several tables. A chain (B feeds
   C) is allowed; a cycle is refused with the names of the tables. The link can be removed ("Unlink"): B becomes an ordinary
   table and keeps its rows. A flow reads B as any reference table; the engine does not know about the link.
2. **Values.** The distinct values of `c` in a published version of A: text trimmed, blank values left out, case and accents
   count (`a` and `A` are two values). When a link is made, the values come from the version of A that is in effect today (the
   last published version when none is) and B gets a draft with them as its rows: the key column filled, the other columns empty.
3. **When A changes.** When a version of A is published, every table linked to A takes the values of that version that its key
   column does not hold yet (in any version of B, draft or published). They are added as rows to the draft of B; if B has no
   draft, one is made as a copy of its latest published version. The draft starts on the day the new version of A starts when
   that is after the start of B's last published version, otherwise on the day after the end of B's latest published range
   (the day after its start when that range has no end, D139; today when B has no published version). B is never published by this: the admin does it. A draft of A does not change B. The publish
   of A and the update of B happen together, or neither happens. A value that leaves A stays in B and is shown as "Not in A
   any more" (information, nothing is deleted); the values that A holds are those of its latest published version (D140).
4. **The notice.** The admin sees it in the app, nowhere else (there is no email). Each time rows were added, B has an open
   notice "{n} new values from {A} · {c} need their other columns: {first values}". It shows on the Reference tables screen
   (on the table, with "Open the draft"), as a dot on "Reference tables" in the sidebar, and in the draft the new rows are marked
   "New". The notice closes when the draft that holds the values is published. Publishing with new rows that have every other
   column empty shows a quiet warning in the publish dialog and does not block it.
5. **Refusals.** Publishing a version of A without the linked column is refused and names the linked tables. Deleting A while a
   table is linked to it is refused and names them (unlink first). Deleting B works as before and drops its link.
6. **Rights.** Only an admin links, unlinks, and sees the notices. Who reads the rows of B is as in section 12.1.
7. **Server.** Migration `20261118000021` adds the link to `ref_tables` (`link_table_id`, `link_column`, `key_column`), the table
   `ref_table_link_events` (admin only), the function that applies a link, the change of `publish_ref_table_version` that calls
   it, the cycle and column checks, and the change of `delete_ref_table`. `LocalStore` and `SupabaseStore` give the same messages
   and results; a shared list of cases (`supabase/tests/ref-link-cases.json`) is used by the database test and the unit test.

### 16.3 What does not change

- A flow, a version, a run and the files of a run with no print layout and no link behave as before; the acceptance flow and both datasets pass unchanged.
- The privacy rule holds (no request carries file content), the drag budgets of 13.1 and the Phase 8 steps are untouched.
- No PDF, no logo and no email (see the out-of-scope list).

### 16.4 Gates for Phase 9

- G1 adds a generated flow with a print layout, run through the real engine in Chromium: the file is read back and its table
  equals the table of the same flow without a layout, cell by cell; the page setup (paper, orientation, margins, fit to width,
  the repeated header row, the footer), the header lines (merged, with the tokens replaced) and the signature block are checked
  in the file; a flow with two sheets; a table of 20,000 rows within the measured time. The two acceptance datasets still pass
  with the same flow file and the same bytes as before.
- G2 has unit tests for the print settings and tokens, the writer, the page-break rule, the link rules (distinct values, new
  values, cycles, refusals), and the catalog keys.
- G3 has the journeys: a flow with a print layout is built, previewed, run and downloaded; a table is linked, a version of A is published
  with a new value, B gets a draft, the admin sees the notice, fills the columns, publishes, and the notice closes; a chain; a cycle is refused.
- G4 checks every new route and state in both themes (the print group of the Output form, the print preview, the link dialog,
  the notice, the dot in the sidebar, the marked rows), with the pseudo-locale check.
- G5 covers migration 21 from zero (the link columns, the events table and its rules, the publish function with the cascade, atomic
  with the publish, the cycle and the column checks, the delete refusal, the grants) with the shared cases.
- The Pages build stays under its size limit with ExcelJS as a separate file, and `npm run test:acceptance:pages` passes.
