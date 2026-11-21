# Tabs

Switches between sections of one object (a flow, an employee). The underline sits on the bottom border.

## Props

- `items`: `{ value, label, count? }[]`, `value` / `defaultValue`, `onChange(value)`, `label` (accessible name of the tab list).

## Rules

- 2 to 6 tabs, short nouns. Arrow keys move and select (automatic activation).
- Every tab keeps the same page skeleton so switching never shifts the layout.
