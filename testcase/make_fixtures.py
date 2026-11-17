"""Generate the acceptance-test input files for the Data Flow Webapp.

Creates three workbooks with dummy data for one month (default September 2026):
  input/timesheet_YYYY-MM.xlsx      wide timesheet, 2 rows per employee
  input/employees.xlsx              employee list with join and leave dates
  reference/reference_tables.xlsx   attendance codes, OT types, OT limits

All names, codes and limits are sample values made for testing only.
Run:  python make_fixtures.py                       (September 2026, this folder)
      python make_fixtures.py --month 10 --out variant_2026-10
"""
import argparse
import calendar
import datetime as dt
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

YEAR, MONTH = 2026, 9
DAYS_IN_MONTH = 30  # set again in main() from the chosen month
HOLIDAYS = {2}  # 2 September, marked with code L in the timesheet
ROOT = Path(__file__).resolve().parent

FONT = Font(name="Arial", size=10)
BOLD = Font(name="Arial", size=10, bold=True)
TITLE = Font(name="Arial", size=12, bold=True)
HEAD_FILL = PatternFill("solid", fgColor="DDE3EE")
THIN = Side(style="thin", color="B0B7C3")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTER = Alignment(horizontal="center", vertical="center")


def is_sunday(day):
    return dt.date(YEAR, MONTH, day).weekday() == 6


def base_pattern(work_code, first=1, last=DAYS_IN_MONTH):
    """Attendance codes for a normal month: work Mon-Sat, rest on Sunday."""
    codes = {}
    for day in range(first, last + 1):
        if day in HOLIDAYS:
            codes[day] = "L"
        elif is_sunday(day):
            codes[day] = "NT"
        else:
            codes[day] = work_code
    return codes


def build_cases():
    """One entry per employee. Each employee covers one group of rules."""
    cases = []

    def add(emp_id, name, join, leave, att, ot, in_list=True, in_sheet=True):
        cases.append(dict(emp_id=emp_id, name=name, join=join, leave=leave,
                          att=att, ot=ot, in_list=in_list, in_sheet=in_sheet))

    # E0001: plain day worker, no OT.
    add("E0001", "An Nguyen", dt.date(2020, 3, 2), None, base_pattern("X"), {})

    # E0002: day OT inside every limit, one day of annual leave.
    att = base_pattern("X")
    att[10] = "P"
    add("E0002", "Binh Tran", dt.date(2021, 6, 1), None, att,
        {3: 2, 8: 2, 15: 2, 22: 2})

    # E0003: night shift worker with night OT.
    add("E0003", "Chi Le", dt.date(2019, 11, 18), None, base_pattern("N"),
        {4: 3, 11: 3, 18: 2})

    # E0004: day limit. 5 h breaks the 4 h limit, 4 h is exactly on the limit.
    add("E0004", "Dung Pham", dt.date(2022, 1, 10), None, base_pattern("X"),
        {9: 5, 16: 4})

    # E0005: week limit. 20 h in one week breaks 16 h, 16 h in the next is fine.
    add("E0005", "Giang Vo", dt.date(2023, 4, 3), None, base_pattern("X"),
        {14: 4, 15: 4, 16: 4, 17: 4, 18: 4, 21: 4, 22: 4, 23: 4, 24: 4})

    # E0006: month limit. 12 days x 3.5 h = 42 h, no day or week breach.
    ot = {day: 3.5 for day in (7, 8, 9, 10, 14, 15, 16, 17, 21, 22, 23, 24)}
    add("E0006", "Hai Do", dt.date(2018, 8, 20), None, base_pattern("X"), ot)

    # E0007: joined on 14 Sep. Codes and OT before that date are exceptions.
    att = base_pattern("X", first=14)
    att[10] = "X"
    att[11] = "X"
    add("E0007", "Khanh Bui", dt.date(YEAR, MONTH, 14), None, att, {11: 2, 15: 2})

    # E0008: left on 18 Sep. A code and OT after that date are exceptions.
    att = base_pattern("X", last=18)
    att[19] = "X"
    add("E0008", "Linh Dang", dt.date(2017, 5, 8), dt.date(YEAR, MONTH, 18), att,
        {8: 2, 21: 3})

    # E0009: OT on a leave day, an unknown code, sick leave, unpaid leave.
    att = base_pattern("X")
    att[7] = "P"
    att[8] = "ZZ"
    att[9] = "O"
    att[10] = "O"
    att[11] = "KL"
    add("E0009", "Minh Ho", dt.date(2020, 9, 1), None, att, {7: 2, 15: 1})

    # E0010: holiday OT on the limit, rest-day OT inside and over the limit.
    add("E0010", "Nga Duong", dt.date(2021, 2, 15), None, base_pattern("X"),
        {2: 8, 6: 6, 13: 9})

    # E0011: half days, a missing code, a value in day 31, a text OT value.
    att = base_pattern("X")
    att[5] = "X/2"
    att[12] = "X/2"
    del att[17]
    att[31] = "X"
    add("E0011", "Phuc Ly", dt.date(2024, 7, 1), None, att, {5: 1.5, 22: "2h"})

    # E0012: in the employee list but not in the timesheet.
    add("E0012", "Quyen Truong", dt.date(2022, 10, 3), None, {}, {},
        in_sheet=False)

    # E9999: in the timesheet but not in the employee list.
    add("E9999", "Unknown Person", None, None, base_pattern("X"), {3: 2},
        in_list=False)

    return cases


def style_header(ws, row, last_col):
    for col in range(1, last_col + 1):
        cell = ws.cell(row=row, column=col)
        cell.font = BOLD
        cell.fill = HEAD_FILL
        cell.border = BORDER
        cell.alignment = CENTER


def write_timesheet(cases, path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Timesheet"

    # Row 1 is a title, row 2 is empty, row 3 is the header row.
    ws["A1"] = f"TIMESHEET - {calendar.month_name[MONTH].upper()} {YEAR} (sample data for testing)"
    ws["A1"].font = TITLE
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=34)

    header = ["Employee ID", "Full name", "Row type"] + list(range(1, 32))
    for col, value in enumerate(header, start=1):
        ws.cell(row=3, column=col, value=value)
    style_header(ws, 3, len(header))

    row = 4
    for case in cases:
        if not case["in_sheet"]:
            continue
        # Employee ID and Full name are merged across the 2 rows of an employee.
        ws.cell(row=row, column=1, value=case["emp_id"])
        ws.cell(row=row, column=2, value=case["name"])
        ws.merge_cells(start_row=row, start_column=1, end_row=row + 1, end_column=1)
        ws.merge_cells(start_row=row, start_column=2, end_row=row + 1, end_column=2)
        ws.cell(row=row, column=3, value="ATT")
        ws.cell(row=row + 1, column=3, value="OT")
        for day in range(1, 32):
            if day in case["att"]:
                ws.cell(row=row, column=3 + day, value=case["att"][day])
            if day in case["ot"]:
                ws.cell(row=row + 1, column=3 + day, value=case["ot"][day])
        for r in (row, row + 1):
            for col in range(1, 35):
                cell = ws.cell(row=r, column=col)
                cell.font = FONT
                cell.border = BORDER
                if col >= 3:
                    cell.alignment = CENTER
        ws.cell(row=row, column=1).alignment = CENTER
        ws.cell(row=row, column=2).alignment = Alignment(vertical="center")
        row += 2

    ws.column_dimensions["A"].width = 13
    ws.column_dimensions["B"].width = 18
    ws.column_dimensions["C"].width = 10
    for col in range(4, 35):
        ws.column_dimensions[get_column_letter(col)].width = 5
    ws.freeze_panes = "D4"
    wb.save(path)


def write_employees(cases, path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Employees"
    header = ["Employee ID", "Full name", "Join date", "Leave date"]
    for col, value in enumerate(header, start=1):
        ws.cell(row=1, column=col, value=value)
    style_header(ws, 1, len(header))
    row = 2
    for case in cases:
        if not case["in_list"]:
            continue
        values = [case["emp_id"], case["name"], case["join"], case["leave"]]
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col, value=value)
            cell.font = FONT
            cell.border = BORDER
            if col >= 3:
                cell.number_format = "yyyy-mm-dd"
        row += 1
    for letter, width in zip("ABCD", (13, 18, 12, 12)):
        ws.column_dimensions[letter].width = width
    ws.freeze_panes = "A2"
    wb.save(path)


def write_table(ws, header, rows, widths):
    for col, value in enumerate(header, start=1):
        ws.cell(row=1, column=col, value=value)
    style_header(ws, 1, len(header))
    for r, values in enumerate(rows, start=2):
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=r, column=col, value=value)
            cell.font = FONT
            cell.border = BORDER
    for col, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(col)].width = width
    ws.freeze_panes = "A2"


def write_reference_tables(path):
    wb = Workbook()

    ws = wb.active
    ws.title = "attendance_codes"
    write_table(
        ws,
        ["code", "description", "work_day_value", "day_category", "ot_type"],
        [
            ["X", "Day shift worked", 1, "WORK", "OT_DAY"],
            ["N", "Night shift worked", 1, "WORK", "OT_NIGHT"],
            ["X/2", "Half day worked", 0.5, "WORK", "OT_DAY"],
            ["P", "Annual leave", 0, "PAID_LEAVE", None],
            ["KL", "Unpaid leave", 0, "UNPAID_LEAVE", None],
            ["O", "Sick leave", 0, "SICK", None],
            ["NT", "Weekly rest day", 0, "REST", "OT_REST"],
            ["L", "Public holiday", 0, "HOLIDAY", "OT_HOLIDAY"],
        ],
        [8, 22, 16, 16, 14],
    )

    ws = wb.create_sheet("ot_types")
    write_table(
        ws,
        ["ot_type", "description", "day_limit_hours"],
        [
            ["OT_DAY", "OT after a day shift", 4],
            ["OT_NIGHT", "OT after a night shift", 4],
            ["OT_REST", "OT on a weekly rest day", 8],
            ["OT_HOLIDAY", "OT on a public holiday", 8],
        ],
        [14, 26, 16],
    )

    ws = wb.create_sheet("ot_limits")
    write_table(
        ws,
        ["period", "limit_hours"],
        [["WEEK", 16], ["MONTH", 40]],
        [10, 12],
    )

    ws = wb.create_sheet("Notes")
    notes = [
        "Reference tables for the acceptance test. Version 1, valid from 2026-01-01, no end date.",
        "All codes and limits are sample values made for testing. They are not legal limits.",
        "attendance_codes.ot_type is the OT type that applies when OT follows that code on the same day.",
        "An empty ot_type means OT is not allowed on a day with that code.",
        "ot_types.day_limit_hours is the OT limit per employee per day for that OT type.",
        "ot_limits holds the OT limit per employee per ISO week and per month, all OT types together.",
    ]
    for r, text in enumerate(notes, start=1):
        ws.cell(row=r, column=1, value=text).font = FONT
    ws.column_dimensions["A"].width = 110

    wb.save(path)


def main():
    global YEAR, MONTH, DAYS_IN_MONTH
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--month", type=int, default=9)
    parser.add_argument("--out", default=".", help="output folder, relative to this script")
    args = parser.parse_args()
    YEAR, MONTH = args.year, args.month
    DAYS_IN_MONTH = calendar.monthrange(YEAR, MONTH)[1]
    out = ROOT / args.out
    (out / "input").mkdir(parents=True, exist_ok=True)
    (out / "reference").mkdir(parents=True, exist_ok=True)
    cases = build_cases()
    write_timesheet(cases, out / "input" / f"timesheet_{YEAR}-{MONTH:02d}.xlsx")
    write_employees(cases, out / "input" / "employees.xlsx")
    write_reference_tables(out / "reference" / "reference_tables.xlsx")
    print("Fixtures written:", sum(c["in_sheet"] for c in cases), "employees in the timesheet,",
          sum(c["in_list"] for c in cases), "in the employee list")


if __name__ == "__main__":
    main()
