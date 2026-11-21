# Alert

An inline message inside the page, above the content it concerns. Persistent until resolved or dismissed. For short confirmations of an action, use a Toast.

## Props

- `tone`: `info`, `success`, `warning`, `danger`. `title` (one line), children (one or two sentences), `actions` (small Buttons), `onClose`.

## Rules

- Title says what happened; the text says what it means or what to do.
- Only the icon carries the tone color; `danger` alerts also get a `danger` border and `role="alert"`.
