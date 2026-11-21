# EmptyState

What a list, table or chart shows when there is nothing to display: why it is empty and what to do next.

## Props

- `icon`, `title`, `text`, `actions` (one primary Button at most).

## Rules

- Distinguish "nothing yet" (offer to create) from "no results" (offer to clear filters) from "error" (use an Alert with a retry).
- Icon sits in a 48px `surface-300` tile, not a colored circle.
