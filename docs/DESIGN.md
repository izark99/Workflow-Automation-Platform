# Design reference

The look of the app is the design system "Harold" (Spatial): glass panels over a soft blue scene, in the style of visionOS. Its
snapshot is in `design/harold/` (`README.md`, `tokens.json`, `components/<Name>/README.md`, and `components/bundle.css` and
`bundle.js` for exact sizes, states, motion and markup: read them, do not import them, because the bundle is React 18 and the app is
React 19 with CSS modules). This file records what the build adopted; where Harold and this file differ, this file says why.

`design/screens-harold/` has a PNG of each of the seven routes in both themes at 1440 px, made from the running app with the UI audit
(reference only). `design/screens/` is the **old reference, kept for structure and layout only**: its colours, radii and fonts are
superseded.

| Screen | Old reference (`design/screens/`) | Route |
| --- | --- | --- |
| Flows | `1-flows` | `/flows` |
| Flow builder | `2-flow-builder` | `/flows/:id/versions/:versionNo` |
| Run a flow | `3-run` | `/flows/:id/run` |
| Versions | `4-versions` | `/flows/:id/versions` |
| Reference tables | `5-reference-tables` | `/reference-tables` |
| Admin | `6-admin` | `/admin` |
| Components and states | `7-components-and-states` | `/dev/components` (development only) |

The structure comes from step-based automation tools: numbered step cards that run top to bottom, a settings panel with Setup,
Configure and Test tabs, and one strong action per screen. Do not copy the branding of any existing product.

## Harold design system

The Harold tokens are CSS variables with the token name of `design/harold/tokens.json`: `--ink`, `--primary-text`, `--surface-200`,
`--space-4`, `--radius-md`, `--shadow-sm`, `--control-md`, `--blur-md`. They are defined once in `src/ui/tokens.css`, for both themes
under `:root[data-theme]`; the theme-independent ones (type, spacing, radius, size, blur) are in plain `:root`. The Harold font
families are `--family-sans` and `--family-mono`, a type style is four variables (`--type-h1-size`, `-line-height`, `-weight`, and
`-letter-spacing` where there is one) and `src/ui/type.css` has a class for each. Three widths are layout and not design tokens:
`--layout-sidebar` (240 px), `--layout-step-list` (184 px) and `--layout-settings` (380 px). Components never use a raw colour,
radius or shadow; tests fail when one appears (D114).

The tokens the app uses as they are: the scene (`scene-100`, `scene-200` and the two glows), the surfaces (`surface-200` glass,
`surface-300` inset tint, `surface-overlay` for what floats and for dense data), `border`, `border-strong`, `neutral-fill`, `ink`,
`ink-muted`, `primary` (fills), `primary-text` (blue as text or line, and the focus ring), `primary-soft`, `accent` and `accent-soft`
(Ember, used for the Draft state and nowhere else), `success`, `warning`, `danger`, `info`, `thumb`, the radii, the three shadows and
the three blurs, and `control-sm`, `control-md`. The chart tokens are not used: the app has no chart.

Contrast is tested, not assumed (`src/ui/tokens.test.ts`): every text and ground pair of both themes is computed with each translucent
surface composited over `scene-100` and `scene-200` (and over each glow), at 4.5:1 for text and 3:1 for `border-strong`, the focus ring
and meaningful icons. Every pair passes.

Theme rules:

- `<html data-theme="light|dark">` is set by a small inline script in `index.html` before the CSS loads, from the saved choice or, for
  System, from `prefers-color-scheme`. System uses dark unless the browser says it prefers light, so a browser with no preference gets
  dark. `color-scheme` is set to match, so scrollbars and native text fields follow.
- React Flow gets its colours from the tokens (dots, edges, handles, selection, controls). Its own defaults never decide a colour.
- No raw colour anywhere outside `tokens.css`.

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

There is no limit on the number of glass surfaces and no surface that may not be glass: Harold's recipe (translucent fill,
`blur-md` with `saturate(1.5)`, 1 px `border`, `shadow-sm`) may be used on the sidebar, cards, panels, tables, grids, forms,
step cards and the controls of the canvas. Floating layers (dialog, menu, dropdown list, date picker, info popover, toast, sticky
table header) use `surface-overlay`, as Harold says; a dialog scrim uses `scrim` with `blur-sm`.

| Surface | Default fill |
| --- | --- |
| Page | the scene |
| Sidebar, cards, panels, the step list and the settings panel of the builder, tables and grids, step cards, canvas controls | `surface-200` glass |
| Page header (sticky), the header bar of the builder | `surface-overlay` |
| Dialog, menu, dropdown list, date picker, info popover, toast, sticky table header | `surface-overlay` |

Three things still hold. A blurred element does not change size by animation (a collapsing panel keeps its 200 ms and has no
blur while it moves). Without `backdrop-filter` and under `prefers-reduced-transparency`, glass is `surface-overlay`. And the drag
budgets of SPEC 13.1 are never loosened: if blur on some element makes a drag test fail, remove the blur from that element, keep
its `surface-overlay` fill and record it in `docs/DECISIONS.md`. Text on glass keeps the contrast of the contrast test.

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

## Buttons

| Size | Height | Padding | Font | Where |
| --- | --- | --- | --- | --- |
| `md` (default) | 40 px (`control-md`) | 0 16 px | 500 14 px | Page and section actions, sidebar, dialogs |
| `sm` | 32 px (`control-sm`) | 0 12 px | 500 13 px | Table rows, toolbars, the step list, function chips |

Variants: `primary` (blue fill), `secondary` (default, `neutral-fill`), `ghost` (transparent, `surface-300` on hover) and `danger`
(the `danger` fill). No variant has a border. Disabled is 40 % opacity on the whole control. Press scales to 0.98 over 120 ms (not
under reduced motion). A button that waits (`busy`) keeps its width, shows a spinner over its label and sets `aria-busy="true"`. An
icon button is as wide as it is high, always has a label, and shows it as a tooltip after 400 ms of hover and at once on keyboard
focus; Escape hides the tooltip.

Rules:

- At most one `primary` button per screen. On screens with the sidebar it is "Create flow" in the sidebar; in the builder it is "Run";
  in a modal dialog it is the confirming button of the footer, last. The other buttons are `secondary`.
- No other button height exists (the 24 px info button and the 40 x 24 px switch are the two exceptions the UI rules know).
- Buttons with the same visible name in a table carry an `aria-label` that names the row.
- Destructive buttons sit 8 px away from their neighbours and open a confirm dialog.

## Layout

- Minimum window width 1280 px. No horizontal page scroll at 1280 or 1440.
- Sidebar 240 px open (64 px as a rail, Phase 5), glass, the same on every screen except the builder.
- The page header is 64 px high, sticky, on `surface-overlay`: the breadcrumb line (20 px), the title (28 px on 38 px) with its info
  button, and one action on the right. The content below it is up to 1200 px wide with `space-7` (48 px) side margins and 24 px
  between blocks. On every screen with the sidebar the title is at the same y (**23 px**) and the first block starts at the same y
  (**88 px**); the UI rule `headerPosition` checks both (measured in T7.10, D106).
- Cards are glass (`surface-200`, blur, 1 px `border`, `shadow-sm`), `radius-lg` (22 px), `space-5` (24 px) padding, or no padding
  when they hold a table. No card sits inside a card, and none has a coloured stripe on one side.
- Tables: a sticky header of 40 px (41 with its divider) on `surface-overlay`, 13 px text at 500 in `ink-muted`; body rows 44 px plus a
  1 px divider (45 px; dense rows, for a grid where the same data is edited, 36 px plus 1); numbers right-aligned in tabular figures;
  cells do not wrap.
- Builder: header bar 64 px on `surface-overlay`, step list 184 px and settings panel 380 px on glass (each 48 px as a rail), canvas on
  the scene in between. Step cards are 240 x 56 px on `surface-overlay`, 40 px apart, `radius-md`, with a 2 px `primary-text` ring when
  selected. The panels have no blur while their width changes.
- The widths above are the open widths. Collapsing a panel changes only its width and the width of what is next to it: the header, the
  title y (23 px) and the first block y (88 px) do not move (SPEC 12.4).
- Radii: 8 px (checkbox, badge, skeleton), 14 px (button, field, select, menu, step card), 22 px (card, panel), 32 px (dialog), pills.

## Components built for this app

No browser-default widget is allowed for these. Build them (a headless
accessibility library is allowed, a styled UI kit is not):

| Component | Requirements |
| --- | --- |
| Dropdown | A 40 px field box with a chevron that turns, a `surface-overlay` list (opens in 200 ms, closes in 120 ms), the selected option in `primary-text` with a check at its end, arrow keys, Enter, Escape, type-ahead |
| Date picker | Button showing `30 Sep 2026`, popover with month grid starting Monday, previous and next month, arrow keys, Escape. Opens upward when there is no room below |
| Checkbox and Switch | Drawn 18 px box with `role="checkbox"`, Space toggles. The switch (`role="switch"`, 40 x 24 px) is for a setting that applies at once; no screen has one, because every yes/no is saved later |
| Search field | Field with a search icon inside, no browser clear button |
| Tabs and filter chips | Buttons with a pressed or selected state |
| Dialog | `surface-overlay`, `radius-xl`, `shadow-lg` over a blurred scrim; enters in 260 ms, leaves in 170 ms; focus trap, Escape closes (the top layer only), focus returns to the opener |
| Table, Card, Badge, Skeleton, Toast | As drawn on `/dev/components`. A status badge has an icon and a word; the Draft state is `accent`. The skeleton has the row heights of the table and a 1.4 s shimmer, also under reduced motion. A toast is fixed at the bottom right, at most 3, 5 s |
| Info button (Phase 4) | See "Info button" below |
| Panel toggle (Phase 5) | See "Collapsible panels" below |
| Theme switch and language switch (Phase 4) | In the sidebar footer, above Sign out: two compact dropdowns, "Theme" (Light, Dark, System) and "Language" (English, Tiếng Việt). The sign-in screen has the same two controls in its top right corner |

Forbidden in the DOM: `<select>`, `input[type=date]`, `input[type=checkbox]`,
`input[type=radio]`, `input[type=search]`, `input[type=color]`, and a visible
`input[type=file]` (a hidden one behind a button is fine). `<input type="text">`
and `<textarea>` are allowed; textareas are not resizable.

## Info button

Explanations live behind an info button (SPEC 11.2), not as visible paragraphs.

- A 24 x 24 px icon button with a 16 px "i" in a circle, `ink-muted`, placed 4 px after the title or label it explains. Its accessible name is "About {label}" (from the catalog). This is the one exception to the 40 and 32 px button rule; the UI rule allows it by its `data-infotip` attribute and checks that it is exactly 24 x 24 px (WCAG 2.2 target size).
- It is a toggletip: click, Enter or Space opens a popover, a second click closes it; it also opens on hover after 300 ms and closes when the pointer leaves both the button and the popover; Escape or a click outside closes it; focus stays on the button. The popover text is announced through a polite live region.
- Popover: `surface-overlay`, 1 px `border`, `radius-md`, `shadow-md`, padding 12 px, max width 320 px, 13 px text, may hold a short list and links. It opens below, or above when there is no room, and never covers the field it explains.
- Never for errors, warnings that block an action, or anything the user must read to finish a task. Those stay visible.
- Info buttons do not count as `primary`, and a screen has no more than one per label.

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

Gaps, margins and padding are on the Harold scale: 4, 8, 12, 16, 24, 32, 48 and 64 px (`space-1` to `space-8`). 20 px and 40 px are gone.
The exceptions are 1 and 2 px hairlines and borders, the styles that React Flow owns (its panel margins), and the negative offset that
draws a focus ring around a control. A test (`src/ui/tokens.test.ts`) fails on any other value in a CSS module; `ui-audit/audit.spec.ts`
lists the computed ones on every route.

## UI quality checklist (Phase 4)

Used by the review of SPEC 11.6. Each item is checked on every route in both themes at 1280 and 1440 px.

1. Hierarchy: one h1 per page, h2 for card titles, no skipped levels. The one main action stands out; secondary actions are quieter.
2. Spacing on the Harold scale (4, 8, 12, 16, 24, 32, 48, 64). Equal gaps between equal things.
3. Alignment: labels, fields and table columns line up; numbers right-aligned; long names truncate with an ellipsis and show the full name on hover and to screen readers.
4. Every data region has its loading, empty and error state, as in the section below.
5. Feedback within 100 ms for every action: pressed state, busy state, or a toast for a finished background action. A toast is never the only place an error appears.
6. Forms: required fields marked, errors under the field after submit or blur (not while typing), focus moves to the first error, Enter submits a dialog.
7. Unsaved changes: leaving the builder or a reference table grid with unsaved changes asks first.
8. Keyboard: every action reachable; visible focus in both themes; Escape closes the top layer; Delete removes the selected step; the builder lists its keyboard keys in an info button.
9. Text: no text under 12 px; sentence case; numbers and dates in one format; no explanation visible that belongs in an info button.
10. Motion: 120 ms for hover, press and toggles, 200 ms for menus and popovers, 260 ms for dialogs (closing about two thirds); only opacity and transform move, except the width of a collapsing panel (200 ms, no blur while it moves). Nothing moves with `prefers-reduced-motion` but short fades.
11. Both themes: no element keeps a light-only or dark-only colour; images and icons stay visible.

## Loading, empty, and error states

- Skeleton: a placeholder with the same header and row heights as the real table, so nothing moves when data arrives. Show it only when loading takes longer than 300 ms. The region has `aria-busy="true"` while loading. A soft band sweeps over the bars every 1.4 s, also with `prefers-reduced-motion`.
- Run in progress: progress bar with `Step n of m` and the step name, plus Cancel run.
- Empty state: icon, one line of text, one action.
- Error state: says what failed and what to do next, next to the place where it failed. Never only a toast.
- Confirm before delete: dialog that names the flow and says it can be restored for 30 days.

## Accessibility

- Text contrast 4.5:1 or more. Control borders 3:1 or more. In both themes, on the glass over the scene.
- Every control is reachable and usable with the keyboard, with a visible focus ring.
- No information by color alone: breaches show a word, not only a red number.

## Collapsible panels (Phase 5)

- Four panels collapse (SPEC 12.4): the sidebar (240 to 64 px), the builder step list (184 to 48 px), the builder settings panel (380 to 48 px) and the Reference tables list (to 48 px).
- The toggle is a small (32 px) secondary icon button with `aria-expanded` and `aria-controls`, at the top of the panel on its inner edge: a chevron that points to the edge the panel sits on when it is open (left chevron for a left panel) and away from it when collapsed. Its accessible name says what it does and which panel: "Collapse sidebar", "Expand settings panel". The toggle sits 12 px from the top and 8 px from the inner edge.
- A rail has the card colour, a 1 px line on its inner edge, and no padding other than 8 px; it never scrolls.
- Sidebar rail (64 px): the toggle, then the "Create flow" button as a 40 x 40 px `primary` icon button, then the three navigation items as 40 x 40 px icon buttons (the current one with the soft primary background, `aria-current`), and at the bottom one 40 x 40 px user button (the first letter of the name) that opens a popover with the name, the role, Language, Theme, Change password and Sign out. Every icon button has an accessible name and a `title` from the catalog.
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

- A 40 px icon button (a link icon) at the end of the input box row, with the accessible name "Use a parameter for {field}" and `aria-haspopup="listbox"`. It does not count as `cta`, and it is one height with the box beside it. A read-only version shows it disabled. When the flow has no parameter that fits the setting the button is disabled and its tooltip says so.
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
