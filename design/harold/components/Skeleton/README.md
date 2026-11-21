# Skeleton

Placeholder blocks that keep the final layout while data loads, with a soft shimmer. Every async view (Table, KpiTile, cards, lists) loads with skeletons, never with a full-page spinner.

## Props

- `variant`: `block` (default), `text` (12px line; `lines` for a paragraph whose last line is 60%), `title` (20px), `circle` (`size`).
- `width`, `height`, `radius`, `style`.

## Rules

- Match the real content's size and position exactly so nothing shifts when data arrives (no layout shift). Then fade content in with the `hd-fade-in` class (200ms).
- Mark the loading container `aria-busy="true"`; skeleton blocks are `aria-hidden`.
- Show skeletons only after about 300ms of waiting to avoid a flash on fast loads; past 10 seconds, add a line of text saying what is still loading.
- Shimmer is a 1.4s sweep of a light band; it stops under reduced motion (blocks stay static). In dark theme the band is 6% white.
