# Dialog

A modal for a decision or a short form that must be finished before going back. Not for information that could sit in the page.

## Props

- `open`, `onClose`, `title`, children (body), `footer` (Buttons, primary last), `width` (px, default 480), `tone: "danger"` (uses `alertdialog`), `dismissible` (scrim click closes, default true), `contained` and `autoFocus={false}` (demos).

## Behaviour

- Focus moves into the dialog and is trapped; Escape closes; focus returns to the trigger.
- Enters over 260ms (fade, 8px rise, 0.98 scale), leaves in 170ms. Scrim is `ink` at 45%.

## Rules

- Title is the question; the confirm button repeats the verb ("Xoá flow"), never "OK" or "Có".
- Destructive dialogs state what will be lost and what will not.
- On mobile, use Sheet instead.
