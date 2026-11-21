# Table

The data table for every list in the webapps. Sticky header, tabular numbers right-aligned, sortable columns, row selection, skeleton loading and an empty state built in.

## Props

- `columns`: `{ key, header, align?: "right", width?, sortable?, sortValue?(row), render?(row) }[]`.
- `rows`, `rowKey(row, i)` (default `row.id`).
- Sorting: uncontrolled with `defaultSort: { key, dir }`, or controlled with `sort` + `onSortChange` (server-side). Sort uses Vietnamese collation.
- Selection: `selectable`, `selected` (array of keys), `onSelectedChange(keys)`. The header checkbox shows indeterminate when some rows are on.
- `loading` + `skeletonRows` (default 5): renders skeleton cells with the real column widths, so nothing jumps when data arrives. Rows then fade in over 200ms.
- `empty`: node shown when `rows` is empty (defaults to an EmptyState).
- `dense` (36px rows), `maxHeight` (scrolls inside, header stays), `onRowClick(row)`, `caption` (screen readers).

## Rules

- Numbers right-aligned with units in the header ("OT tháng (giờ)"), never in every cell.
- Status is a Badge with an icon and a word, never a colored dot alone.
- Row actions go in a final Menu column; bulk actions appear above the table when rows are selected.
- On mobile, do not squeeze a table: switch to ListItem rows.
