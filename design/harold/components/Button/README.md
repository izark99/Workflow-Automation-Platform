# Button

Triggers one action. Variants: `primary` (blue fill, at most one per view, for the action the page exists for), `secondary` (`neutral-fill`, the default), `ghost` (toolbars, cancel), `danger` (destructive, always confirmed by a Dialog).

## Props

- `variant`: `"primary" | "secondary" | "ghost" | "danger"`, default `secondary`.
- `size`: `"sm"` 32px (dense toolbars, laptop only), `"md"` 40px (default), `"lg"` 48px (mobile and touch).
- `icon`, `iconRight`: a Lucide icon name from `Harold.Icon.names`.
- `loading`: shows a spinner, keeps the width, blocks clicks and sets `aria-busy`.
- `block`: full width (mobile footers, sheets).
- `as`: render as another element, e.g. `"a"` with `href`.
- All native button props pass through.

## Rules

- Label is a verb in sentence case: "Lưu", "Chạy flow", "Export report". No trailing punctuation.
- Buttons in one row share one size. Primary sits rightmost in dialogs and footers.
- No variant has a border: borders make an outlined button read larger than a filled one of the same box. Secondary is a solid `neutral-fill`.
- Use `loading` instead of disabling while a request runs; never swap the label for "Loading...".
- Press feedback is a 0.98 scale over 120ms; it is removed under reduced motion.
