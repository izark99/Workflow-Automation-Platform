# Select

A custom single-select dropdown (no native `<select>` styling). Use it for 4 to about 15 options; fewer than 4 use RadioGroup or SegmentedControl.

## Props

- `options`: `{ value, label, icon?, disabled? }[]`.
- `value` + `onChange(value, option)` (controlled) or `defaultValue`.
- `label`, `placeholder`, `helper`, `error`, `required`, `icon`, `size`, `disabled`, `defaultOpen` (demos).

## Behaviour

- Keyboard: Arrow keys, Home, End, Enter or Space to choose, Escape to close, type letters to jump (Vietnamese labels match from the first letter).
- The list opens in 200ms and closes in 120ms; the chevron turns 180 degrees.
- The selected option shows in `primary` with a check. Disabled options stay visible at 40% opacity.
