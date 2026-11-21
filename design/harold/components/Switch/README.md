# Switch

A setting that applies immediately (no Save button). For choices submitted with a form, use Checkbox.

## Props

- `label`, `checked` / `defaultChecked`, `onChange(boolean)`, `disabled`.

## Rules

- 40 x 24px track; the thumb slides 16px over 200ms. Checked track is `primary`, unchecked is `border-strong` so it keeps 3:1 against the surface.
- Show a Toast if the change fails and revert the switch.
