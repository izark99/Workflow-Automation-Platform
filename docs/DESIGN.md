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

### Tokens for both themes (Phase 4)

The table above is the light theme. The dark theme redefines the same names under `:root[data-theme="dark"]`.
Components never test the theme; they only use tokens. Two new tokens carry the text colour on filled buttons, because
the dark fills are light:

| Token | Light | Dark |
| --- | --- | --- |
| `--color-bg` | `#F0FDFA` | `#0E1A19` |
| `--color-card` | `#FFFFFF` | `#152422` |
| `--color-ink` | `#134E4A` | `#E3F2EF` |
| `--color-muted` | `#475569` | `#A7BDB9` |
| `--color-line` | `#99F6E4` | `#2A4A46` |
| `--color-rule` | `#E8F1F4` | `#1D302D` |
| `--color-control` | `#6F918D` | `#6E938E` |
| `--color-primary` | `#0F766E` | `#2DD4BF` |
| `--color-on-primary` (new) | `#FFFFFF` | `#04201D` |
| `--color-primary-soft` | `#CCFBF1` | `#123F3B` |
| `--color-focus` | `#0D9488` | `#5EEAD4` |
| `--color-cta` | `#C2410C` | `#FB923C` |
| `--color-on-cta` (new) | `#FFFFFF` | `#2A1003` |
| `--color-accent` | `#EA580C` | `#FB923C` |
| `--color-danger` | `#B91C1C` | `#F87171` |
| `--color-skeleton` | `#DCE7EA` | `#22362F` |

The dark values were checked for these pairs (WCAG contrast): ink on bg 15.4, ink on card 13.9, muted on card 8.1,
control on card 4.8, focus on card 10.9, on-primary on primary 9.2, on-cta on cta 7.9, danger on card 5.8, ink on
primary-soft 10.1. Task T4.1 adds a unit test that computes every pair of both themes, so a later change cannot
break contrast. If the test needs a value changed, change it here first.

Theme rules:

- `<html data-theme="light|dark">` is set by a small inline script in `index.html` before the CSS loads, from the saved choice or, for System, from `prefers-color-scheme`. `color-scheme` is set to match, so scrollbars and native text fields follow.
- React Flow gets `colorMode` from the app theme, and its colours (background dots, edges, handles, selection, controls) map to tokens. Its own default styles must not decide any colour.
- Shadows, if any, are tokens too. No raw colour anywhere outside `tokens.css`.

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
- Page header has a fixed structure and height on every screen: breadcrumb line 24 px, title 36 px, one action on the right. The title sits at the same y on every screen (63 px), and the first block starts at the same y on every screen. Up to Phase 3 a 21 px subtitle sat under the title and the first block started at 148 px. From Phase 4 the subtitle moves into an info button after the title (section "Info button"); task T4.6a measures the new y of the first block, writes it here, and updates the UI rule in the same commit.
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
| Info button (Phase 4) | See "Info button" below |
| Theme switch and language switch (Phase 4) | In the sidebar footer, above Sign out: two compact dropdowns, "Theme" (Light, Dark, System) and "Language" (English, Tiếng Việt). The sign-in screen has the same two controls in its top right corner |

Forbidden in the DOM: `<select>`, `input[type=date]`, `input[type=checkbox]`,
`input[type=radio]`, `input[type=search]`, `input[type=color]`, and a visible
`input[type=file]` (a hidden one behind a button is fine). `<input type="text">`
and `<textarea>` are allowed; textareas are not resizable.

## Info button

Explanations live behind an info button (SPEC 11.2), not as visible paragraphs.

- A 24 x 24 px icon button with a 16 px "i" in a circle, `--color-muted`, placed 4 px after the title or label it explains. Its accessible name is "About {label}" (from the catalog). This is the one exception to the 40 and 36 px button rule; the UI rule allows it by its `data-infotip` attribute and checks that it is exactly 24 x 24 px (WCAG 2.2 target size).
- It is a toggletip: click, Enter or Space opens a popover, a second click closes it; it also opens on hover after 300 ms and closes when the pointer leaves both the button and the popover; Escape or a click outside closes it; focus stays on the button. The popover text is announced through a polite live region.
- Popover: card colours, control border, radius 8 px, padding 12 px, max width 320 px, 13 px text, may hold a short list and links. It opens below, or above when there is no room, and never covers the field it explains.
- Never for errors, warnings that block an action, or anything the user must read to finish a task. Those stay visible.
- Info buttons do not count as `cta`, and a screen has no more than one per label.

## Account dialogs (Phase 4)

- Admin, Users tab: each row shows a status badge (Active, Locked, Must change password) and a "More" menu with Reset password, Lock or Unlock. "Add user" opens Create account.
- Create account and Reset password: password field with "Generate" (compact, secondary) and "Copy"; a checkbox "Must change password at next sign-in", on by default. The dialog says once, in an info button, that the password is not shown again.
- Lock: confirm dialog that names the user and says their open session ends now.
- Change password: a full-page card in the same layout as the sign-in screen, with new password and confirm fields. It is the only thing shown while a password change is required.

## Flow parameters (Phase 4)

- Builder: a "Parameters" button (compact, secondary) in the builder header opens a 380 px panel in place of the settings panel: a list of parameters (label, key, type badge) with Add, edit and reorder by keyboard (Move up, Move down). Read-only for a published version.
- Run screen: a Parameters card above the Files card, one row per parameter in the definition order: label with info button, the control for its type, the error under it. The card is hidden when the flow has no parameters.
- The Test tab shows the parameters used upstream of the selected step, in a compact form above the files.

## UI quality checklist (Phase 4)

Used by the review of SPEC 11.6. Each item is checked on every route in both themes at 1280 and 1440 px.

1. Hierarchy: one h1 per page, h2 for card titles, no skipped levels. The one main action stands out; secondary actions are quieter.
2. Spacing on a 4 px grid (4, 8, 12, 16, 20, 24, 32, 40). Equal gaps between equal things.
3. Alignment: labels, fields and table columns line up; numbers right-aligned; long names truncate with an ellipsis and show the full name on hover and to screen readers.
4. Every data region has its loading, empty and error state, as in the section below.
5. Feedback within 100 ms for every action: pressed state, busy state, or a toast for a finished background action. A toast is never the only place an error appears.
6. Forms: required fields marked, errors under the field after submit or blur (not while typing), focus moves to the first error, Enter submits a dialog.
7. Unsaved changes: leaving the builder or a reference table grid with unsaved changes asks first.
8. Keyboard: every action reachable; visible focus in both themes; Escape closes the top layer; Delete removes the selected step; the builder lists its keyboard keys in an info button.
9. Text: no text under 12 px; sentence case; numbers and dates in one format; no explanation visible that belongs in an info button.
10. Motion: transitions at most 200 ms, none with `prefers-reduced-motion`.
11. Both themes: no element keeps a light-only or dark-only colour; images and icons stay visible.

## Loading, empty, and error states

- Skeleton: a placeholder with the same header and row heights as the real table, so nothing moves when data arrives. Show it only when loading takes longer than 300 ms. The region has `aria-busy="true"` while loading. Bars pulse; with `prefers-reduced-motion` they do not move.
- Run in progress: progress bar with `Step n of m` and the step name, plus Cancel run.
- Empty state: icon, one line of text, one action.
- Error state: says what failed and what to do next, next to the place where it failed. Never only a toast.
- Confirm before delete: dialog that names the flow and says it can be restored for 30 days.

## Accessibility

- Text contrast 4.5:1 or more. Control borders 3:1 or more. In both themes.
- Every control is reachable and usable with the keyboard, with a visible focus ring.
- No information by color alone: breaches show a word, not only a red number.
