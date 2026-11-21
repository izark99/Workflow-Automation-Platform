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

## Harold design system (Phase 7)

From Phase 7 (SPEC 14) the look of the app is the design system "Harold" (Spatial). Its snapshot is in `design/harold/`:
`README.md` (principles and rules), `tokens.json` (every value), `components/<Name>/README.md` (guidelines), and
`components/bundle.css` and `bundle.js` (exact sizes, states, motion and markup; read them, do not import them: the bundle is
React 18 and the app is React 19 with CSS modules). **Where this section and an older section of this file disagree, this
section wins.** Task T7.18 rewrites the older sections to the final values and removes this note. `design/screens/` stays as the
reference for structure and layout only; its colours, radii and fonts are superseded.

### Rules that changed

| Before (Phases 2 to 6) | From Phase 7 |
| --- | --- |
| Teal palette, orange `cta` button, orange accent | Harold tokens (below). One `primary` blue button per screen. Ember (`accent`) at most once per screen, never for a warning or an error |
| Font Plus Jakarta Sans | Be Vietnam Pro 400, 500, 600 and 700 (Latin and Vietnamese subsets) and JetBrains Mono 400 and 500, both from `@fontsource`, served by the app |
| Text 14 px on 21 px | The Harold type table below |
| Buttons 40 px and compact 36 px, border on secondary | 40 px (`md`) and 32 px (`sm`). No variant has a border. The 24 px info button stays |
| Table header 40 px, rows 56 px plus 1 px | Header 40 px, rows 44 px plus a 1 px divider (45 px), dense rows 36 px plus 1 px |
| Sidebar 232 px | 240 px. The 64 px rail and the builder widths (184, 380, 48 px rails) do not change |
| Radius 8 px controls, 10 px step cards, 12 px cards | 8 (checkbox, badge, skeleton), 14 (button, input, select, menu, step card), 22 (card, panel, dialog), 32 (outer window, hero panel), pills |
| Cards: white with a 1 px line | Glass: translucent fill, blur, 1 px `border`, `shadow-sm` |
| Spacing 4, 8, 12, 16, 20, 24, 32, 40 | 4, 8, 12, 16, 24, 32, 48, 64 (`space-1` to `space-8`). 20 and 40 px are gone |
| Transitions at most 200 ms | 120 ms (hover, press, toggles), 200 ms (menus, popovers), 260 ms (dialogs); closing about two thirds. Only opacity and transform move. The width of a collapsing panel keeps 200 ms and the panel has no blur while it moves |
| Focus ring 2 px `--color-focus`, offset 2 px | 2 px `primary-text`, 2 px gap in the scene colour. Same geometry |
| Default theme System | System stays. With no browser preference the app uses dark |
| Title at y 63, first block at y 123, rows 57 | Measured again in T7.10 with the 64 px page header and recorded in `docs/DECISIONS.md`; the rule that every sidebar screen has them at the same y stays |

### Token mapping

The Harold names are the CSS variable names (`--surface-200`, `--ink`, `--primary`, `--space-4`, `--radius-md`, ...), for both
themes under `:root[data-theme]`. While the screens are moved, the old names may exist as aliases that point to a Harold token;
the last Phase 7 tasks remove them.

| Old name | Harold token |
| --- | --- |
| `--color-bg` | `scene-100` (the page also draws the scene: `scene-200` fading to `scene-100` with the two glows) |
| `--color-card` | `surface-200` (glass), or `surface-overlay` for what floats and for dense data |
| `--color-ink`, `--color-muted` | `ink`, `ink-muted` |
| `--color-line`, `--color-rule` | `border` |
| `--color-control` | `border-strong` |
| `--color-primary`, `--color-on-primary`, `--color-primary-soft` | `primary` (fill), `on-primary`, `primary-soft` |
| `--color-focus`, `--color-badge-ink` and other blue text | `primary-text` |
| `--color-cta`, `--color-on-cta` | removed: the `primary` button |
| `--color-accent` | `accent` (Ember), one highlight per screen; the build uses it for the Draft state of a version and nowhere else |
| `--color-danger`, `--color-danger-soft`, `--color-danger-ink` | `danger`, `on-danger` (fill text); the soft background is `surface-300` with a `danger` border |
| `--color-skeleton` | `surface-300` and `neutral-fill` |
| `--color-overlay`, `--shadow-popover` | `scrim` (with `blur-sm`), `shadow-md` |
| `--color-note-*`, `--color-draft-*`, `--color-ended-*` | `info`, `accent`, `ink-muted` on `surface-300` |
| `--font-sans`, `--font-mono` | the Harold families `sans` and `mono` |
| `--radius-control` | `radius-md` |

The extra tokens of Harold that the app uses as they are: `surface-100`, `surface-300`, `neutral-fill`, `neutral-fill-hover`,
`primary-hover`, `accent-soft`, `on-accent`, `success`, `warning`, `info`, `thumb`, `shadow-sm`, `shadow-md`, `shadow-lg`,
`blur-sm`, `blur-md`, `blur-lg`, `control-sm`, `control-md`. The chart tokens (`chart-1` to `chart-5`) are not used: the app has no chart.

### Type

| Style | Size / line | Weight | Use in the app |
| --- | --- | --- | --- |
| `h1` | 28 / 38 | 600 | Page title (one per page) |
| `h2` | 22 / 32 | 600 | Card titles on screens |
| `h3` | 18 / 28 | 600 | Dialog titles, titles of the settings panel and of the step list |
| `body` | 16 / 24 | 400 | Text, paragraphs, messages |
| `label` | 14 / 20 | 500 | Form labels, buttons, tabs, table headers |
| `small` | 14 / 20 | 400 | Table cells, helper text, metadata, the settings panel when 16 px does not fit (record it in `docs/DECISIONS.md`) |
| `caption` | 12 / 16 | 500 | Axis-like labels, footnotes, section titles of the sidebar (the only uppercase) |
| `mono` | 13 / 20 | 400 | Formulas, keys, ids, SQL |

`display-xl`, `display` and `kpi` are not used. Input text is 15 px and table header text is 13 px, as in `bundle.css`: the
sizes allowed on a route are the sizes of this table plus the sizes that `bundle.css` uses for controls. Numbers in a table, a
progress text or a changing value use `font-variant-numeric: tabular-nums`. Weights below 400 do not exist. Sentence case
everywhere. Lines are 60 to 75 characters at most.

### Glass, and where it is used

| Surface | Fill | Blur |
| --- | --- | --- |
| Page | the scene | none |
| Sidebar, cards and panels on the screens, the step list and the settings panel of the builder | `surface-200` | `blur-md` + `saturate(1.5)` |
| Page header (sticky), the header bar of the builder | `surface-overlay` | none |
| Dialog, menu, dropdown list, date picker, info popover, toast, sticky table header | `surface-overlay` | none (the dialog scrim has `blur-sm`) |
| Tables, grids, long forms, the canvas, the step cards on it, the controls and the bar at the bottom of the canvas | `surface-overlay` or `surface-300` | none |

At most 6 elements with a backdrop blur on a route, never inside or over the canvas (the scrim of a dialog excepted), and no
animation of the size of a blurred element. Without `backdrop-filter` and under `prefers-reduced-transparency`, glass is
`surface-overlay`.

### Components

Restyle each component of "Components built for this app" to its Harold counterpart. Behaviour, keyboard keys and accessible names
stay. Read `design/harold/components/<Name>/README.md` and `bundle.css` for each.

| Component here | Harold | Note |
| --- | --- | --- |
| Button | Button | `primary`, `secondary` (default), `ghost`, `danger`; `md` 40, `sm` 32; `loading` keeps the width; press 0.98 over 120 ms; the label is a verb |
| Icon-only button | IconButton | Always a label and a tooltip; toolbars and table rows use `ghost` |
| Field (text, number, textarea) | TextField | Label above, helper line, error replaces the helper; focus is a 1 px `primary` inner ring; the error says what to fix |
| Dropdown | Select | Selected option in `primary` with a check; opens in 200 ms, closes in 120 ms; chevron turns |
| Date picker | DatePicker | Our format `30 Sep 2026` stays; the popover, the selected day (blue fill) and today (ring) follow Harold |
| Checkbox, yes/no | Checkbox (18 px, 1.5 px `border-strong`) and Switch (40 x 24 px) | A setting that applies at once is a Switch only where it does so today |
| Tabs, filter chips | Tabs, Chip (32 px pill) | Selected chip: `primary-soft` with a `primary` border and a check |
| Dialog | Dialog | Title is the question; the confirm button repeats the verb; enters in 260 ms, leaves in 170 ms |
| Menu, popover, info button | Menu, Tooltip | The info button keeps its 24 px size and toggletip behaviour (Phase 4) |
| Toast | Toaster | Fixed bottom right, at most 3, 5 s, polite announcement |
| Badge | Badge | A status carries an icon and a word |
| Card | Card | `radius-lg`, `space-5`, no stripe, no nested card |
| Table | Table | Sticky header on `surface-overlay`, numbers right-aligned |
| Skeleton, empty state | Skeleton, EmptyState | Shimmer 1.4 s sweep, still under reduced motion; the icon sits in a 48 px `surface-300` tile |
| Error and warning messages | Alert | The icon carries the tone; `danger` also has a `danger` border and `role="alert"` |
| Run progress | ProgressBar | Width changes over 260 ms |
| Reference grid pager | Pagination | |
| Breadcrumbs, sidebar, page header | Breadcrumbs, Sidebar, NavItem, TopBar | The "Create flow" button stays the one `primary` button of the screens that have it |

### Icons and wordmark

The 47 Lucide icons of `design/harold/assets/Icons/README.md`, drawn in `currentColor`, stroke 2 at 16 px and below and 1.75
above, sizes 16 (dense), 20 (default) and 24. Their path data is in `design/harold/components/bundle.js`. An icon that the app
needs and the set lacks is taken from Lucide v0.460.0 (same stroke and corners) and recorded in `docs/DECISIONS.md`. There is
no logo: the app name is set in `sans` 700 next to a `radius-sm` blue square.

### Rules that Harold adds to the UI quality checklist

- No gradient except the scene (on the page background only), no gradient text, no glow around a component, no card with a
  coloured stripe on one side, no emoji, no icon in a coloured circle above a card title.
- Text colours: `primary-text` and `accent` only for links, active states and the one highlight, never for body text.
- Status is never colour alone: a word or an icon comes with `success`, `warning`, `danger` and `info`.
- Disabled is 40 % opacity on the whole control, with the not-allowed cursor.
- Empty text says why it is empty and what to do; an error says what failed and what to do (already a rule here).
- No filler numbers and no marketing words ("seamless", "unlock", "empower") in any text.

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

The extra tokens of the screens follow the same rule. Dark values: `--color-badge-ink` `#99F6E4`, `--color-danger-soft`
`#3A1717`, `--color-danger-ink` `#FECACA`, `--color-note-bg` `#2B1A0E`, `--color-note-ink` `#FED7AA`,
`--color-draft-ink` `#FDBA74`, `--color-ended-ink` `#CBD5E1`, `--color-overlay` `rgb(0 0 0 / 60%)` (light: the teal
at 35%), `--shadow-popover` black at 50%. The toast uses `--color-bg` as its text colour on `--color-ink`, so it
inverts in both themes. `--color-on-fill` is gone: filled primary buttons, selected days, checked boxes and the
in-effect segment use `--color-on-primary`; the CTA button uses `--color-on-cta`.

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
- Sidebar 232 px open (64 px as a rail, Phase 5), white, the same on every screen except the builder.
- Main column: padding 32 px 40 px, 24 px between blocks.
- Page header has a fixed structure and height on every screen: breadcrumb line 24 px, title 36 px with an info button after it (the old subtitle text, SPEC 11.2), one action on the right. The title sits at the same y on every screen (63 px), and the first block starts at the same y on every screen: **123 px** from Phase 4 (it was 148 px when a 21 px subtitle sat under the title). The header is 67 px high (24 + 4 + 3 + 36). The UI rule `headerPosition` checks both values.
- Cards: white, 1 px line border, radius 12 px, padding 20 px, or no padding when they hold a table.
- Tables: header cell padding 8 px 16 px with a 24 px line (a 40 px header; it was 10 px 16 px with a 20 px line), 12 px bold muted text; body rows 56 px high plus a 1 px divider; numbers right-aligned; cells do not wrap.
- Builder: header bar 64 px, step list 184 px, settings panel 380 px (each 48 px as a rail, Phase 5), canvas in between. Step cards 240 x 56 px, 40 px apart, selected card with a 2 px accent border.
- The widths above are the open widths. Collapsing a panel changes only its width and the width of what is next to it: the header, the title y (63 px) and the first block y (123 px) do not move (SPEC 12.4).

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
| Panel toggle (Phase 5) | See "Collapsible panels" below |
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

## Spacing

Gaps, margins and padding are on the 4 px grid (4, 8, 12, 16, 20, 24, 32, 40). The exceptions are 1 and 2 px hairlines and borders, the styles that React Flow owns (its panel margins), the negative 2 px offset that draws a focus ring around a control, and the 3 px that aligns the title with its info button in the page header. Do not add other values; `ui-audit/audit.spec.ts` lists the ones that are left.

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

## Collapsible panels (Phase 5)

- Four panels collapse (SPEC 12.4): the sidebar (232 to 64 px), the builder step list (184 to 48 px), the builder settings panel (380 to 48 px) and the Reference tables list (to 48 px).
- The toggle is a compact (36 px) secondary icon button with `aria-expanded` and `aria-controls`, at the top of the panel on its inner edge: a chevron that points to the edge the panel sits on when it is open (left chevron for a left panel) and away from it when collapsed. Its accessible name says what it does and which panel: "Collapse sidebar", "Expand settings panel". The toggle sits 12 px from the top and 8 px from the inner edge.
- A rail has the card colour, a 1 px line on its inner edge, and no padding other than 8 px; it never scrolls.
- Sidebar rail (64 px): the toggle, then the "Create flow" button as a 40 x 40 px `cta` icon button, then the three navigation items as 40 x 40 px icon buttons (the current one with the soft primary background, `aria-current`), and at the bottom one 40 x 40 px user button (the first letter of the name) that opens a popover with the name, the role, Language, Theme, Change password and Sign out. Every icon button has an accessible name and a `title` from the catalog.
- Step list rail: the toggle only. Settings panel rail: the toggle, and below it the step name written upright (`writing-mode: vertical-rl`, 13 px, muted, one line, truncated with an ellipsis, full name in `title`); with no step selected the rail shows only the toggle.
- Motion: the width changes in at most 200 ms (`ease-out`); with `prefers-reduced-motion` it changes at once. Contents that do not fit while the width changes are clipped, never wrapped.
- Both themes: the rail and the toggle use the tokens of the card and the line; no new colour.

## Reference table import (Phase 5)

- A "Import file" button (secondary, default size) sits in the Reference tables header next to "New table", for the admin only. It opens a dialog 720 px wide.
- Steps in one dialog, top to bottom, each shown when it applies: file (the visible button "Choose file", the name of the file after it); sheet (a dropdown, xlsx only); header row (a field, default 1); preview (a table of the first 20 rows with the columns as headers); columns (one row per column: a field for the name and a dropdown for the type); target (three chips: "New table", "New version", "Replace the draft", then the fields of the chosen target).
- Errors are listed under the step that caused them, each with row and column (SPEC 12.1 item 4), at most 5, then "and {n} more". The Import button stays disabled while the file, the columns or the target are invalid, and a note says why, as on the Run screen.
- While the file is read or the table is saved, the dialog shows a progress bar with the step ("Reading the file", "Saving"). Cancel works while reading.
- After a successful import the dialog closes, the new draft is open on the screen, and a toast says "Imported {n} rows as a draft. Check it, then publish."
- The screen for a user has no Import button and shows a "Used by" line under the title of each table in the list and above the grid (the flow names, three at most, then "and {n} more").

## Admin: Settings tab and the inactivity dialog (Phase 5)

- Admin gets a third tab, Settings (after Users and Texts). It has one card, "Sign-out after inactivity", with a number field "Hours without activity" (1 to 72), an info button that explains what counts as activity and that the check runs in the browser, and a Save button (default size, enabled only when the value changed and is valid). A saved value shows a toast.
- The inactivity dialog (SPEC 12.2) is a modal dialog titled "Still there?", with the text "You will be signed out in {time} because there was no activity." and, when there are unsaved changes, a second line "Unsaved changes will be lost." Buttons: "Stay signed in" (primary) and "Sign out now" (secondary). The countdown is announced to screen readers once a minute and at 10 seconds, not every second. It never has a close button.
- The sign-in screen shows "You were signed out after {hours} hours without activity." as a quiet note (muted text with an info icon, not an error box) above the form.

## Texts tab (Phase 5)

- Columns: Key (monospace 13 px, 220 px), English, Vietnamese (each takes half of the rest, text clamped to two lines, `data-user-content` on the text because it is the admin's data), Actions (Edit, and Reset when the key has an edit). A cell whose text differs from the default has a soft "Edited" badge under the text.
- Toolbar: the search field, a screen dropdown, and an "Edited only" chip. There is no language control.
- The edit dialog is 880 px wide: the key on top (monospace); below, two equal columns, English and Vietnamese, each with a labelled text area (5 rows), the default under it in muted 12 px text, and a compact "Reset" button for that language; errors sit under the text area that failed; the footer has "Cancel", "Reset both" (secondary) and "Save" (primary).

## Phase 5 additions to the checklist

- Item 8 (keyboard) also covers the panel toggles: every toggle is reachable by Tab in reading order, Space and Enter work, and the focus stays on the toggle when the panel changes width.
- Item 11 (both themes) also covers the rails, the import dialog and the inactivity dialog.
- A UI rule per panel checks the open width and the collapsed width, that the title and the first block keep their y, that nothing needs horizontal scrolling, and that every control of an open panel is reachable when the panel is collapsed (the sidebar rail) or after opening it (the others).

## Dragging steps (Phase 6)

- A card follows the pointer without lag: no CSS transition on its position or transform while it is dragged, no shadow or filter that is recalculated on every frame, `cursor: grabbing` on the card while it is held. The cards, the edges and the controls (zoom bar) are drawn again only when something that they show changes, never on every pointer move.
- The position is written to the flow when the card is dropped (one change per drag). Until then the card is the only thing that moves; the settings panel, the step list and the header do not change.
- A card that is held near the edge of the canvas makes the canvas pan (React Flow's auto pan), and it stays visible. A card is never hidden behind another layer while it is held.
- A published version has no drag: the cursor stays `default` and the card does not move.

## Parameter control (Phase 6)

A single-value input box of a step (SPEC 13.3) can take a parameter. The Parameters panel itself does not change.

- A 36 px icon button (a link icon) at the end of the input box row, with the accessible name "Use a parameter for {field}" and `aria-haspopup="listbox"`. It does not count as `cta`, and it is one height with the box beside it. A read-only version shows it disabled. When the flow has no parameter that fits the setting the button is disabled and its tooltip says so.
- It opens a dropdown list (the Dropdown component) of the parameters whose type fits the setting: label first, the key in muted text after it. Choosing one binds the field.
- A bound field is not an input any more: it is one row with the chip "Parameter: {label}" (the link icon in front, `data-user-content` on the label) and a compact "Use a fixed value" button that gives the field back with its last fixed value. Under it, 12 px muted text "Now: {value}" in the Test tab and on the Run screen (`data-user-content`); when the value cannot be resolved the line is an error under the field that says what failed and what to do. A parameter that is deleted from the flow leaves the field with the chip in the error state "Parameter {key} no longer exists".
- Errors are shown under the field, never in the dropdown only. The dropdown closes with Escape and the focus returns to its button.

## Reference table step (Phase 6)

- One entry in the step list, named "Reference table", in the group Files next to Input file, with the same button size and drag behaviour as the other entries. Its card on the canvas has the table icon, the name "Reference table" and, under it in muted text, the name of the chosen table (`data-user-content`) or "Choose a table" before one is chosen. It has one output handle and no input handle.
- Configure tab: a dropdown "Table" (every table name, `data-user-content`); under it the columns of the table as a read-only list with their types (the newest readable version), and the line "Version used on {date}: v2, from 01 Jul 2026 to 31 Dec 2026" for the test date of the builder. When the table cannot be read yet, the line is "You cannot read this table yet. Save the flow to read this table." and the columns are not listed. When no version covers the test date, an error under the dropdown names the table and the date and says to add a version or change the date.
- The Test tab previews the first 100 rows like every step.
- The date check (SPEC 13.3 item 7): in the publish dialog and under the dropdown, a warning block (the quiet warning style of the Versions screen, with the alert icon, not an error box) lists each gap as "{table} has no published version from {date} to {date}: a run for these dates will stop." The publish button stays enabled. A flow whose tables have no gap shows nothing.
- The Run screen lists the table and its version in the card "Versions used for this date", like the tables of a Lookup step.

## Analyze file (Phase 6)

On the Test tab of an Input step, above the list of test files. The button "Analyze file" (compact, secondary) is enabled when a test file is chosen. While it works the panel shows a progress bar and "Reading the file"; Cancel works.

- Result, top to bottom: one line per proposed setting (Sheet, Header row, First column, Last column, Stop at, Columns the file must have, Fill down), each with its value, a confidence badge (High: soft; Medium and Low: outline, and Low has a warning icon) and an info button that gives the reason. A setting that the analysis cannot decide shows "Not decided" in muted text.
- "Left out": a short list of the areas that are not read ("Rows 1 to 4: title", "Rows 38 to 41: footer") and the other tables that were found ("Rows 12 to 20, columns A to D").
- The preview: the first 30 rows of the sheet in a table with the row numbers in the first column; the header row is bold, the rows of the region are normal, the rows outside the region are dimmed (50% opacity, and "Left out" for screen readers). It scrolls inside its box (focusable, `aria-label`).
- "Apply to the step" (primary, default size) fills the Configure tab and moves to it; "Close" leaves it as it was. A short note in an info button says that the file stays in the browser and only the settings are saved.
- States: no file ("Choose a test file first."), reading, nothing found ("No table found. Set the header row by hand."), error (what failed and what to do).

## Region settings on the Configure tab (Phase 6)

First column and last column (fields that take a letter or a number), "Stop at" (a dropdown: End of the sheet, First empty row, A row that contains a text, A fixed row) with its own fields shown under it, "Rows to ignore" (a list of a column and a text, with Add and Remove), and "Columns the file must have" (a list of names, filled by Analyze file or by "Load columns" as in the other forms). Each of these settings has the parameter control.

## Run screen: resolved values (Phase 6)

The card "Versions used for this date" gets one more group, "Settings that use a parameter": one row per bound setting, "{step}, {setting}: {value}". It is shown only when the flow has such settings, so the numbering of the cards does not change. A binding that cannot be resolved stops the run with the error under the row, as for a missing file. The tables of Reference table steps are listed with their versions in the same card, and the date check warning of SPEC 13.3 item 7 shows above the list when a gap touches the effective date.

## Phase 6 additions to the checklist

- Item 3 (alignment) also covers the parameter control (one height with the field it belongs to) and the proposal lines of the analysis (labels and values line up).
- Item 4 (states) also covers the analysis panel (no file, reading, nothing found, error), a bound field that cannot be resolved, and the Reference table step (no table chosen, unreadable table, no version for the date, a gap warning).
- Item 8 (keyboard) also covers the parameter dropdown, the Reference table step (added with its button by keyboard, like the other steps) and the preview of the analysis.
- Item 10 (motion): nothing moves on a drag except the card.
