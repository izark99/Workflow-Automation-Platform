# Checkbox

An on/off choice that takes effect on submit, or row selection in a Table. For a setting that applies immediately, use Switch.

## Props

- `label`, `description` (second line in `ink-muted`), `checked` / `defaultChecked`, `indeterminate`, `disabled`.
- `onCheckedChange(boolean)` as a shortcut for `onChange`.

## Rules

- The whole label is clickable. Box is 18px with a 1.5px `border-strong` outline; checked fills `primary` with a check that scales in over 120ms.
- Phrase labels positively ("Chỉ tính ngày làm việc"), never as a double negative.
