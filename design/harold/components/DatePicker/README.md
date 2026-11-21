# DatePicker

A custom date field with a calendar popover. Displays `dd/mm/yyyy`; the value is an ISO string `YYYY-MM-DD` so it sorts and stores cleanly.

## Props

- `value` / `defaultValue`: `"YYYY-MM-DD"` or `null`. `onChange(iso | null)`.
- `locale`: `"vi"` (default: T2 to CN, "Tháng 11, 2026") or `"en"`. Weeks start on Monday.
- `label`, `placeholder`, `helper`, `error`, `required`, `clearable` (adds a clear button), `defaultOpen` (demos).
- `Harold.Calendar` is the bare calendar for inline use; `Harold.formatDate(date)` gives `dd/mm/yyyy`.

## Behaviour

- Arrow keys move by day and week, PageUp and PageDown by month, Escape closes and returns focus.
- Today has an outline ring; the selected day is a blue fill. Days outside the month are muted.
- For effective-dated ranges use two DatePickers side by side ("Hiệu lực từ", "Đến"), never one range control.
