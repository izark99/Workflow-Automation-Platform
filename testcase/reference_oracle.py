"""Reference implementation of the timesheet rules (see TEST_RULES.md).

Reads the input files and the reference tables, applies rules R1 to R12,
and writes expected/expected_output_2026-09.xlsx. The web app passes the
acceptance test when its output matches that workbook cell by cell.

This script shares no code with make_fixtures.py: it reads the xlsx files
the same way the app must read them.
Run:  python reference_oracle.py                                          (September 2026, this folder)
      python reference_oracle.py --dir variant_2026-10 --effective-date 2026-10-31
"""
import argparse
import datetime as dt
from collections import defaultdict
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent
EFFECTIVE_DATE = dt.date(2026, 9, 30)  # the run parameter; it sets the month. main() can change it
DATA_DIR = ROOT
TIMESHEET_HEADER_ROW = 3

FONT = Font(name="Arial", size=10)
BOLD = Font(name="Arial", size=10, bold=True)
HEAD_FILL = PatternFill("solid", fgColor="DDE3EE")
THIN = Side(style="thin", color="B0B7C3")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

OT_COLUMNS = {
    "OT_DAY": "ot_day_hours",
    "OT_NIGHT": "ot_night_hours",
    "OT_REST": "ot_rest_hours",
    "OT_HOLIDAY": "ot_holiday_hours",
}
CATEGORY_COLUMNS = {
    "PAID_LEAVE": "paid_leave_days",
    "UNPAID_LEAVE": "unpaid_leave_days",
    "SICK": "sick_days",
    "HOLIDAY": "holiday_days",
    "REST": "rest_days",
}


def is_blank(value):
    return value is None or (isinstance(value, str) and value.strip() == "")


def to_date(value):
    if isinstance(value, dt.datetime):
        return value.date()
    return value


def read_table(path, sheet, header_row=1):
    ws = load_workbook(path)[sheet]
    rows = list(ws.iter_rows(min_row=header_row, values_only=True))
    header = rows[0]
    return [dict(zip(header, row)) for row in rows[1:] if any(not is_blank(v) for v in row)]


def read_timesheet(path):
    """R1: header on row 3, fill down Employee ID and Full name, 2 rows per employee."""
    ws = load_workbook(path)["Timesheet"]
    rows = list(ws.iter_rows(min_row=TIMESHEET_HEADER_ROW, values_only=True))
    header = rows[0]
    day_columns = {i: int(h) for i, h in enumerate(header) if isinstance(h, (int, float))}
    sheet = {}  # employee_id -> {"ATT": {day: value}, "OT": {day: value}}
    current_id = None
    for row in rows[1:]:
        if all(is_blank(v) for v in row):
            continue
        if not is_blank(row[0]):
            current_id = str(row[0]).strip()
        row_type = str(row[2]).strip().upper()
        sheet.setdefault(current_id, {"ATT": {}, "OT": {}})
        sheet[current_id][row_type] = {day: row[i] for i, day in day_columns.items()}
    return sheet


def date_of(day):
    """R2: the month comes from the effective date. Return None for a day that does not exist."""
    try:
        return dt.date(EFFECTIVE_DATE.year, EFFECTIVE_DATE.month, day)
    except ValueError:
        return None


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def run():
    month_tag = f"{EFFECTIVE_DATE.year}-{EFFECTIVE_DATE.month:02d}"
    timesheet = read_timesheet(DATA_DIR / "input" / f"timesheet_{month_tag}.xlsx")
    employees = {
        str(r["Employee ID"]).strip(): r
        for r in read_table(DATA_DIR / "input" / "employees.xlsx", "Employees")
    }
    ref = DATA_DIR / "reference" / "reference_tables.xlsx"
    codes = {str(r["code"]).strip(): r for r in read_table(ref, "attendance_codes")}
    day_limits = {r["ot_type"]: r["day_limit_hours"] for r in read_table(ref, "ot_types")}
    period_limits = {r["period"]: r["limit_hours"] for r in read_table(ref, "ot_limits")}

    exceptions = []
    attendance = defaultdict(list)  # employee_id -> [code row]
    overtime = defaultdict(list)    # employee_id -> [(date, ot_type, hours)]

    def add_exception(emp_id, day, date, row_type, value, reason):
        exceptions.append(dict(employee_id=emp_id, day=day, date=date,
                               row_type=row_type, value=value, reason=reason))

    for emp_id, rows in timesheet.items():
        # R3: every timesheet employee must exist in the employee list.
        if emp_id not in employees:
            add_exception(emp_id, None, None, None, None, "Employee not in employee list")
            continue
        join = to_date(employees[emp_id]["Join date"])
        leave = to_date(employees[emp_id]["Leave date"])

        for day in range(1, 32):
            att = rows["ATT"].get(day)
            ot = rows["OT"].get(day)
            date = date_of(day)

            # R4: a value in a day column that is not a date of the month.
            if date is None:
                for row_type, value in (("ATT", att), ("OT", ot)):
                    if not is_blank(value):
                        add_exception(emp_id, day, None, row_type, value, "Invalid date")
                continue

            # R5: the employment window is join date to leave date, both included.
            inside = join <= date and (leave is None or date <= leave)
            if not inside:
                for row_type, value in (("ATT", att), ("OT", ot)):
                    if not is_blank(value):
                        add_exception(emp_id, day, date, row_type, value, "Outside employment dates")
                continue

            # R6 and R7: the attendance code must exist and must be known.
            code = None
            if is_blank(att):
                add_exception(emp_id, day, date, "ATT", None, "Missing attendance code")
            elif str(att).strip() not in codes:
                add_exception(emp_id, day, date, "ATT", att, "Unknown attendance code")
            else:
                code = codes[str(att).strip()]
                attendance[emp_id].append(code)

            # R8 and R9: OT must be a number, and the code of the day must allow OT.
            if is_blank(ot):
                continue
            if not is_number(ot) or ot < 0:
                add_exception(emp_id, day, date, "OT", ot, "Invalid OT value")
            elif ot > 0:
                if code is not None and not is_blank(code["ot_type"]):
                    overtime[emp_id].append((date, code["ot_type"], float(ot)))
                else:
                    add_exception(emp_id, day, date, "OT", ot, "OT not allowed for attendance code")

    # R11: OT limit breaches per day, per ISO week, and per month.
    breaches = []
    month_label = f"{EFFECTIVE_DATE.year}-{EFFECTIVE_DATE.month:02d}"
    for emp_id, records in overtime.items():
        for date, ot_type, hours in records:
            if hours > day_limits[ot_type]:
                breaches.append(dict(employee_id=emp_id, level="DAY", period=date.isoformat(),
                                     ot_type=ot_type, ot_hours=hours, limit_hours=day_limits[ot_type]))
        weeks = defaultdict(float)
        for date, _, hours in records:
            iso = date.isocalendar()
            weeks[f"{iso[0]}-W{iso[1]:02d}"] += hours
        for label, hours in weeks.items():
            if hours > period_limits["WEEK"]:
                breaches.append(dict(employee_id=emp_id, level="WEEK", period=label, ot_type=None,
                                     ot_hours=hours, limit_hours=period_limits["WEEK"]))
        total = sum(hours for _, _, hours in records)
        if total > period_limits["MONTH"]:
            breaches.append(dict(employee_id=emp_id, level="MONTH", period=month_label, ot_type=None,
                                 ot_hours=total, limit_hours=period_limits["MONTH"]))

    # R10: one summary row per employee found in both files.
    summary = []
    for emp_id in sorted(e for e in timesheet if e in employees):
        row = dict(employee_id=emp_id, full_name=employees[emp_id]["Full name"], work_days=0.0)
        row.update({col: 0 for col in CATEGORY_COLUMNS.values()})
        row.update({col: 0.0 for col in OT_COLUMNS.values()})
        for code in attendance[emp_id]:
            row["work_days"] += float(code["work_day_value"])
            if code["day_category"] in CATEGORY_COLUMNS:
                row[CATEGORY_COLUMNS[code["day_category"]]] += 1
        for _, ot_type, hours in overtime[emp_id]:
            row[OT_COLUMNS[ot_type]] += hours
        row["ot_total_hours"] = sum(row[col] for col in OT_COLUMNS.values())
        row["ot_breach_count"] = sum(1 for b in breaches if b["employee_id"] == emp_id)
        row["exception_count"] = sum(1 for e in exceptions if e["employee_id"] == emp_id)
        summary.append(row)

    # R12: fixed sort order of the three sheets.
    type_order = {None: 0, "ATT": 1, "OT": 2}
    exceptions.sort(key=lambda e: (e["employee_id"], e["day"] or 0, type_order[e["row_type"]]))
    level_order = {"DAY": 0, "WEEK": 1, "MONTH": 2}
    breaches.sort(key=lambda b: (b["employee_id"], level_order[b["level"]], b["period"]))
    return summary, exceptions, breaches


def write_sheet(ws, rows, columns, widths):
    for col, name in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=col, value=name)
        cell.font = BOLD
        cell.fill = HEAD_FILL
        cell.border = BORDER
    for r, row in enumerate(rows, start=2):
        for col, name in enumerate(columns, start=1):
            cell = ws.cell(row=r, column=col, value=row[name])
            cell.font = FONT
            cell.border = BORDER
            if isinstance(row[name], dt.date):
                cell.number_format = "yyyy-mm-dd"
    for col, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(col)].width = width
    ws.freeze_panes = "A2"


SUMMARY_COLUMNS = ["employee_id", "full_name", "work_days", "paid_leave_days", "unpaid_leave_days",
                   "sick_days", "holiday_days", "rest_days", "ot_day_hours", "ot_night_hours",
                   "ot_rest_hours", "ot_holiday_hours", "ot_total_hours", "ot_breach_count",
                   "exception_count"]
EXCEPTION_COLUMNS = ["employee_id", "day", "date", "row_type", "value", "reason"]
BREACH_COLUMNS = ["employee_id", "level", "period", "ot_type", "ot_hours", "limit_hours"]


def write_expected(summary, exceptions, breaches, path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    write_sheet(ws, summary, SUMMARY_COLUMNS, [13, 18] + [16] * 13)
    write_sheet(wb.create_sheet("Exceptions"), exceptions, EXCEPTION_COLUMNS, [13, 6, 12, 10, 10, 36])
    write_sheet(wb.create_sheet("OT_breaches"), breaches, BREACH_COLUMNS, [13, 8, 12, 14, 10, 12])
    ws = wb.create_sheet("Notes")
    notes = [
        f"Expected result of the monthly timesheet flow for effective date {EFFECTIVE_DATE.isoformat()}.",
        "Computed by reference_oracle.py from the files in input/ and reference/, following TEST_RULES.md.",
        "The cells hold values, not formulas: this workbook is the fixed answer the app is compared with.",
        "The app passes when its Summary, Exceptions and OT_breaches sheets match these sheets cell by cell.",
    ]
    for r, text in enumerate(notes, start=1):
        ws.cell(row=r, column=1, value=text).font = FONT
    ws.column_dimensions["A"].width = 110
    wb.save(path)


def check(summary, exceptions, breaches):
    """Hand-computed expectations for the designed cases. A failure means a rule is coded wrong."""
    by_id = {row["employee_id"]: row for row in summary}
    assert sorted(by_id) == [f"E{n:04d}" for n in range(1, 12)], sorted(by_id)

    def expect(emp_id, **values):
        for key, value in values.items():
            assert by_id[emp_id][key] == value, (emp_id, key, by_id[emp_id][key], value)

    expect("E0001", work_days=25.0, rest_days=4, holiday_days=1, ot_total_hours=0.0)
    expect("E0002", work_days=24.0, paid_leave_days=1, ot_day_hours=8.0)
    expect("E0003", work_days=25.0, ot_night_hours=8.0)
    expect("E0004", ot_day_hours=9.0, ot_breach_count=1)
    expect("E0005", ot_day_hours=36.0, ot_breach_count=1)
    expect("E0006", ot_day_hours=42.0, ot_breach_count=1)
    expect("E0007", work_days=15.0, rest_days=2, ot_day_hours=2.0, exception_count=3)
    expect("E0008", work_days=15.0, rest_days=2, holiday_days=1, ot_day_hours=2.0, exception_count=2)
    expect("E0009", work_days=20.0, paid_leave_days=1, sick_days=2, unpaid_leave_days=1,
           ot_day_hours=1.0, exception_count=2)
    expect("E0010", ot_rest_hours=15.0, ot_holiday_hours=8.0, ot_total_hours=23.0, ot_breach_count=1)
    expect("E0011", work_days=23.0, ot_day_hours=1.5, exception_count=3)

    got = [(b["employee_id"], b["level"], b["period"], b["ot_hours"], b["limit_hours"]) for b in breaches]
    assert got == [
        ("E0004", "DAY", "2026-09-09", 5.0, 4),
        ("E0005", "WEEK", "2026-W38", 20.0, 16),
        ("E0006", "MONTH", "2026-09", 42.0, 40),
        ("E0010", "DAY", "2026-09-13", 9.0, 8),
    ], got

    reasons = defaultdict(int)
    for e in exceptions:
        reasons[e["reason"]] += 1
    assert dict(reasons) == {
        "Outside employment dates": 5,
        "OT not allowed for attendance code": 1,
        "Unknown attendance code": 1,
        "Missing attendance code": 1,
        "Invalid date": 1,
        "Invalid OT value": 1,
        "Employee not in employee list": 1,
    }, dict(reasons)


def main():
    global EFFECTIVE_DATE, DATA_DIR
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dir", default=".", help="data folder, relative to this script")
    parser.add_argument("--effective-date", default="2026-09-30")
    args = parser.parse_args()
    EFFECTIVE_DATE = dt.date.fromisoformat(args.effective_date)
    DATA_DIR = ROOT / args.dir
    summary, exceptions, breaches = run()
    designed = DATA_DIR == ROOT and EFFECTIVE_DATE == dt.date(2026, 9, 30)
    if designed:
        check(summary, exceptions, breaches)  # hand-computed expectations exist only for this dataset
    (DATA_DIR / "expected").mkdir(exist_ok=True)
    tag = f"{EFFECTIVE_DATE.year}-{EFFECTIVE_DATE.month:02d}"
    write_expected(summary, exceptions, breaches, DATA_DIR / "expected" / f"expected_output_{tag}.xlsx")
    print(f"Expected output written for {tag}: {len(summary)} summary rows, {len(exceptions)} exceptions, "
          f"{len(breaches)} OT breaches." + (" All hand-computed checks passed." if designed else ""))


if __name__ == "__main__":
    main()
