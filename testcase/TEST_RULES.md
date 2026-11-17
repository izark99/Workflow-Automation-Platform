# Acceptance test: monthly timesheet flow

The web app passes this test when its output workbook matches the expected
workbook cell by cell on the sheets `Summary`, `Exceptions` and `OT_breaches`,
for **both** datasets below. The same flow definition must be used for both.

| Dataset | Folder | Effective date | Expected totals |
| --- | --- | --- | --- |
| September 2026 (designed cases) | `.` | 2026-09-30 | 11 summary rows, 11 exceptions, 4 OT breaches |
| October 2026 (variant) | `variant_2026-10/` | 2026-10-31 | 11 summary rows, 19 exceptions, 5 OT breaches |

The variant uses the same employees in a month with 31 days and other weekdays,
so a result that is hardcoded for September fails on it.

All names, codes and limits are sample values made for testing. They are not
legal limits and not real people.

## Files

| File | Role |
| --- | --- |
| `input/timesheet_2026-09.xlsx` | Timesheet, wide layout, 2 rows per employee |
| `input/employees.xlsx` | Employee list with join date and leave date |
| `reference/reference_tables.xlsx` | Shared reference tables, version 1, valid from 2026-01-01 |
| `expected/expected_output_2026-09.xlsx` | Expected result |
| `make_fixtures.py` | Builds the input files and the reference tables |
| `reference_oracle.py` | Applies the rules below and builds the expected result |

Rebuild everything with `python make_fixtures.py && python reference_oracle.py`.
Build another variant with, for example,
`python make_fixtures.py --month 11 --out variant_2026-11` and
`python reference_oracle.py --dir variant_2026-11 --effective-date 2026-11-30`.
The `Test cases` table below describes the September dataset only.

## Input layout

**Timesheet** (sheet `Timesheet`)

- Row 1 is a title. Row 2 is empty. Row 3 is the header row. Data starts on row 4.
- Columns: `Employee ID`, `Full name`, `Row type`, then one column per day, with headers `1` to `31`.
- Each employee has 2 rows. `Row type` is `ATT` (attendance codes) or `OT` (OT hours).
- `Employee ID` and `Full name` are merged across the 2 rows, so the second row reads as empty.
- The file always has 31 day columns, also in a month with fewer days.

**Employee list** (sheet `Employees`): `Employee ID`, `Full name`, `Join date`, `Leave date`.
An empty `Leave date` means the employee is still employed.

**Reference tables**

| Table | Columns | Meaning |
| --- | --- | --- |
| `attendance_codes` | code, description, work_day_value, day_category, ot_type | `ot_type` is the OT type that applies when OT follows that code on the same day. Empty means OT is not allowed |
| `ot_types` | ot_type, description, day_limit_hours | OT limit per employee per day, by OT type |
| `ot_limits` | period, limit_hours | OT limit per employee per ISO week and per month, all OT types together |

## Rules

| Rule | Description |
| --- | --- |
| R1 | Read the timesheet from header row 3. Fill down `Employee ID` and `Full name`. Use `Row type` to tell the attendance row from the OT row. |
| R2 | The month and year come from the effective date of the run. The date of a cell is that month plus the day number in the column header. |
| R3 | An employee in the timesheet who is not in the employee list gives one exception, `Employee not in employee list`, and is left out of all other results. An employee in the list who is not in the timesheet gives nothing. |
| R4 | A day column that is not a date of the month (day 31 in September) is ignored. A value in such a column gives the exception `Invalid date`. |
| R5 | A date counts only if join date <= date <= leave date. Both ends are included. A value on a date outside this window gives the exception `Outside employment dates` and is not counted. An empty cell outside the window gives nothing. |
| R6 | Inside the window, an empty attendance cell gives the exception `Missing attendance code`. |
| R7 | Inside the window, a code that is not in `attendance_codes` gives the exception `Unknown attendance code` and is not counted. |
| R8 | An empty OT cell means 0 hours. An OT value that is not a number, or is below 0, gives the exception `Invalid OT value`. |
| R9 | The OT type of a day comes from the attendance code of the same employee on the same day. OT above 0 on a day whose code has no OT type, or has no valid code, gives the exception `OT not allowed for attendance code` and is not counted. |
| R10 | `Summary` has one row per employee found in both files. `work_days` is the sum of `work_day_value`. Each `*_days` column counts the days of that `day_category`. Each `ot_*_hours` column sums the valid OT of that OT type. |
| R11 | `OT_breaches` lists valid OT above a limit. `DAY`: hours of one day above the `day_limit_hours` of its OT type. `WEEK`: hours of one ISO week (Monday to Sunday, only days of the run month) above the `WEEK` limit. `MONTH`: hours of the month above the `MONTH` limit. Hours equal to a limit are not a breach. |
| R12 | Sort order. `Summary`: employee_id. `Exceptions`: employee_id, day, row type (`ATT` before `OT`). `OT_breaches`: employee_id, level (`DAY`, `WEEK`, `MONTH`), period. |

## Test cases

| Employee | What it tests | Expected |
| --- | --- | --- |
| E0001 | Plain day worker, no OT | 25 work days, 4 rest days, 1 holiday |
| E0002 | Day OT inside every limit, 1 day of annual leave | 24 work days, 8 h day OT, no breach |
| E0003 | Night shift with night OT | 8 h night OT, no breach |
| E0004 | Day limit: 5 h and 4 h against a 4 h limit | 1 `DAY` breach on 2026-09-09. The 4 h day is not a breach |
| E0005 | Week limit: 20 h and 16 h against a 16 h limit | 1 `WEEK` breach in 2026-W38. The 16 h week is not a breach |
| E0006 | Month limit: 42 h against a 40 h limit | 1 `MONTH` breach, no day or week breach |
| E0007 | Joined on 2026-09-14, with values before that date | 3 exceptions, 15 work days |
| E0008 | Left on 2026-09-18, with values after that date | 2 exceptions, 15 work days |
| E0009 | OT on a leave day, unknown code `ZZ`, sick leave, unpaid leave | 2 exceptions, 20 work days |
| E0010 | Holiday OT on the limit, rest-day OT inside and above the limit | 1 `DAY` breach on 2026-09-13 |
| E0011 | Half days, a missing code, a value in day 31, OT typed as `2h` | 3 exceptions, 23 work days |
| E0012 | In the employee list, not in the timesheet | No row anywhere |
| E9999 | In the timesheet, not in the employee list | 1 exception, no summary row |

Totals for September: 11 summary rows, 11 exceptions, 4 OT breaches.
