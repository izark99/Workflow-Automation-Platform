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
| UI language | English. Keep all UI strings in one module so a second language can be added later |

## 2. Scope

**In scope**

- Canvas builder with 10 node types and one SQL node
- Input from xlsx and csv files. Output to xlsx (several sheets) or csv
- Data preview at every node (first 100 rows)
- Versions with an effective date range for flows and for reference tables
- Shared reference tables that hold rules, not personal data
- Personal flows, shared flows, and user groups
- Soft delete of flows with restore within 30 days

**Out of scope for the MVP**

- Scheduled or triggered runs
- Storing input or output files on the server
- Connectors to APIs, databases, or email
- Effective dates on single rows inside a reference table
- Several people editing one flow at the same time
- An approval step before a version becomes effective
- Reference tables created by non-admin users
- Mobile and tablet layouts

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
| `run_log` | flow_version_id, user_id, effective_date, run_at, row counts, status | Run history. Metadata only, no input data |

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
