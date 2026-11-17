# Design reference

The seven screens in `design/screens/` are the visual target. Each screen has a
plain HTML file (exact markup, sizes and colors) and a PNG screenshot at 1440 px.
`design/build_demo.py` generated them from one set of component functions. Read
it for exact values, but do not copy its inline-style approach into the app.

| Screen | File | Route |
| --- | --- | --- |
| Flows | `1-flows` | `/flows` |
| Flow builder | `2-flow-builder` | `/flows/:id/versions/:versionNo` |
| Run a flow | `3-run` | `/flows/:id/run` |
| Versions | `4-versions` | `/flows/:id/versions` |
| Reference tables | `5-reference-tables` | `/reference-tables` |
| Admin | `6-admin` | `/admin` |
| Components and states | `7-components-and-states` | `/dev/components` (development only) |

The look takes its structure from step-based automation tools: numbered step
cards that run top to bottom, a settings panel with Setup, Configure and Test
tabs, and one strong action per screen. Do not copy the branding of any
existing product.

## Tokens

Define these once as CSS variables. Components never use raw hex values.

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#F0FDFA` | Page background |
| `--color-card` | `#FFFFFF` | Cards, panels, fields |
| `--color-ink` | `#134E4A` | Text |
| `--color-muted` | `#475569` | Secondary text |
| `--color-line` | `#99F6E4` | Card borders, table header rule |
| `--color-rule` | `#E8F1F4` | Row dividers, quiet fills |
| `--color-control` | `#6F918D` | Borders of buttons, fields, popovers (3:1 on white) |
| `--color-primary` | `#0F766E` | Primary buttons, selected states |
| `--color-primary-soft` | `#CCFBF1` | Active nav item, selected option, badges |
| `--color-focus` | `#0D9488` | Focus ring, 2 px, offset 2 px |
| `--color-cta` | `#C2410C` | The one main action per screen |
| `--color-accent` | `#EA580C` | Selected step border, active tab underline |
| `--color-danger` | `#B91C1C` | Destructive actions, errors |
| `--color-skeleton` | `#DCE7EA` | Skeleton bars |
| `--font-sans` | `'Plus Jakarta Sans', system-ui, sans-serif` | All text |
| `--font-mono` | `ui-monospace, Menlo, Consolas, monospace` | Formulas, function chips |
| `--radius-control` | `8px` | Buttons, fields, step cards use 10 px, cards 12 px |

Text is 14 px with 21 px line height. Small text is 12 or 13 px, never smaller.
Page title 28 px bold. Section title (h2) 16 px bold. Icons are 2 px stroke
line icons; an icon library with that style is fine.

## Buttons

| Size | Height | Padding | Font | Where |
| --- | --- | --- | --- | --- |
| Default | 40 px | 0 16 px | 600 14 px | Page and section actions, sidebar, dialogs |
| Compact | 36 px | 0 12 px | 600 13 px | Table rows, toolbars, filter chips, function chips |

Variants: `cta` (orange fill), `primary` (teal fill), `secondary` (white with
control border), `danger` (red text, no border), `disabled`. A button that waits
shows a spinner and `aria-busy="true"`.

Rules:

- One `cta` button per screen at most. On screens with the sidebar it is "Create flow"; in the builder it is "Run".
- No other button height exists. Breadcrumb links are text links, 24 px high.
- Buttons with the same visible name in a table carry an `aria-label` that names the row.
- Destructive buttons sit 8 px away from their neighbours and open a confirm dialog.

## Layout

- Minimum window width 1280 px. No horizontal page scroll at 1280 or 1440.
- Sidebar 232 px, white, the same on every screen except the builder.
- Main column: padding 32 px 40 px, 24 px between blocks.
- Page header has a fixed structure and height on every screen: breadcrumb line 24 px, title 36 px, subtitle 21 px, one action on the right. The title sits at the same y on every screen (63 px), and the first block starts at the same y (148 px).
- Cards: white, 1 px line border, radius 12 px, padding 20 px, or no padding when they hold a table.
- Tables: header cell padding 10 px 16 px, 12 px bold muted text; body rows 56 px high plus a 1 px divider; numbers right-aligned; cells do not wrap.
- Builder: header bar 64 px, step list 184 px, settings panel 380 px, canvas in between. Step cards 240 x 56 px, 40 px apart, selected card with a 2 px accent border.

## Components built for this app

No browser-default widget is allowed for these. Build them (a headless
accessibility library is allowed, a styled UI kit is not):

| Component | Requirements |
| --- | --- |
| Dropdown | Button with chevron, popover list, check mark on the selected option, arrow keys, Enter, Escape, type-ahead |
| Date picker | Button showing `30 Sep 2026`, popover with month grid starting Monday, previous and next month, arrow keys, Escape. Opens upward when there is no room below |
| Checkbox | Drawn box, `role="checkbox"`, Space toggles |
| Search field | Field with a search icon inside, no browser clear button |
| Tabs and filter chips | Buttons with a pressed or selected state |
| Dialog | Focus trap, Escape closes, focus returns to the opener |
| Table, Card, Badge, Skeleton, Toast | As drawn on screen 7 |

Forbidden in the DOM: `<select>`, `input[type=date]`, `input[type=checkbox]`,
`input[type=radio]`, `input[type=search]`, `input[type=color]`, and a visible
`input[type=file]` (a hidden one behind a button is fine). `<input type="text">`
and `<textarea>` are allowed; textareas are not resizable.

## Loading, empty, and error states

- Skeleton: a placeholder with the same header and row heights as the real table, so nothing moves when data arrives. Show it only when loading takes longer than 300 ms. The region has `aria-busy="true"` while loading. Bars pulse; with `prefers-reduced-motion` they do not move.
- Run in progress: progress bar with `Step n of m` and the step name, plus Cancel run.
- Empty state: icon, one line of text, one action.
- Error state: says what failed and what to do next, next to the place where it failed. Never only a toast.
- Confirm before delete: dialog that names the flow and says it can be restored for 30 days.

## Accessibility

- Text contrast 4.5:1 or more. Control borders 3:1 or more.
- Every control is reachable and usable with the keyboard, with a visible focus ring.
- No information by color alone: breaches show a word, not only a red number.
