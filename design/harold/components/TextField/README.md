# TextField

A labelled text input with optional icon, suffix, helper and error. `multiline` renders a textarea.

## Props

- `label` (always provide one; placeholders are examples, never labels), `required`.
- `helper`: one line under the field. `error`: replaces the helper, turns the border `danger`, sets `aria-invalid` and is announced.
- `icon`: leading Lucide icon (search). `suffix`: trailing unit text ("giờ/tháng", "VNĐ").
- `size`: `sm`, default, `lg` (mobile).
- `onValueChange(value)` as a shortcut for `onChange`. All native input props pass through.

## Rules

- Validate on blur or submit, not on every keystroke. The error says what to fix: "Hạn mức không được vượt quá 40 giờ.", not "Invalid value".
- Numbers: `inputMode="numeric"`, unit as `suffix`, and keep thousand separators in display only.
- Focus shows a 1px inner ring in `primary` on top of the border.
