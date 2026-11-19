# UI audit (T4.10a, SPEC 11.6)

Reviewed on 2026-11-19, at the state of commit `28b805f` (after T4.9e).

## Method

- Every route of `ui-rules/routes.ts` (43 states: all screens, the dialogs, the builder forms, the Run result and the three parameter screens), in the light and the dark theme at 1440 px. That is 86 full-page screenshots.
- `ui-audit/audit.spec.ts` (run with `npm run test:ui-rules` first, then `UI_AUDIT_DIR=<folder> npx playwright test -c playwright.ui-audit.config.ts`; not a gate) takes the screenshots and measures what a script can: heading levels, text under 12 px, spacing off the 4 px grid, numbers not right-aligned, truncated text without a title, transitions over 200 ms, and anything that still moves with `prefers-reduced-motion`.
- The rest of the checklist (hierarchy, alignment, states, feedback, both themes) was read on the screenshots of the main screens in both themes: Flows, Versions, Builder (empty panel, formula editor, parameters panel), Run (with parameters), Admin, Reference tables.
- Checklist items are those of `docs/DESIGN.md`, "UI quality checklist" (1 to 11).

## What is already good

- One `h1` per page and no skipped heading levels on any route (item 1, measured).
- No transition over 200 ms, nothing moves with `prefers-reduced-motion` (item 10, measured). No clickable element is outside the keyboard order (item 8, measured). Numbers in tables are right-aligned (item 3, measured), and no truncated text lacks a title.
- Both themes: no light-only or dark-only colour was seen on the screenshots; dark Flows, Versions, Admin and the builder keep the contrast and the focus rings of the rules (item 11).
- The UI rules (`test:ui-rules`) already cover button sizes, info buttons, hint paragraphs, focus rings, contrast (axe) and the pseudo-locale on all of these routes.

## Findings

Severity: high = a user cannot do the job or is misled; medium = a visible flaw on a main screen; low = polish.

| # | Screen | Item | Severity | Finding | Fix | Task |
| --- | --- | --- | --- | --- | --- | --- |
| U1 | Builder, Parameters panel | 3 Alignment | medium | The Type dropdown and the list default dropdown are 338 px wide inside a card whose inside is about 314 px, so they stick out of the card on the right. | Make the dropdowns fit the card (width from the panel, not a fixed 338). | T4.10b |
| U2 | Builder, Formula editor and Filter | 6 Forms | medium | A new Formula column or Filter step shows the red error "The formula is empty" at once, before the user has typed anything. An error must come after submit or blur, not on arrival. | Show the empty formula as a neutral note until the field has been touched. | T4.10c |
| U3 | Run, Parameters card; Builder, Test tab | 6 Forms | medium | A required value that has no default shows its error as soon as the screen opens. | Show an error after the field was touched or Run was pressed; keep Run disabled and put a short note near it that says what is missing. | T4.10d |
| U4 | Run, Parameters card | 4 Error state | low | The error names the key ("Parameter "cutoff" needs a value"), but the user sees the label ("Cut-off date"). | The three value messages use the label. | T4.10e |
| U5 | Run, Parameters card | 3 Alignment, 9 Text | low | A switch (yes or no) is labelled "Strict mode (optional)". A switch is never required, so the suffix is noise. | No "(optional)" on a boolean parameter. | T4.10f |
| U6 | Admin: "Access to shared flows", "Deleted flows" | 9 Text | medium | A sentence of explanation sits under the card title ("Members of a ticked group can view and run the flow...", "A deleted flow is kept for 30 days..."). Explanations belong in an info button. | Move both into an info button after the card title. | T4.10g |
| U7 | Builder canvas | 3 Alignment | medium | The control bar at the bottom left ("13 steps, 1 output sheet", zoom, Fit to screen) covers the last step card when the flow is long. | Keep the canvas clear of the bar: padding at the bottom for fit-to-screen, so no card sits under it. | T4.10h |
| U8 | Builder canvas | 9 Text | low | The output labels "match" and "no match" on a Filter card are 11 px, and they are crossed by the connection line. | 12 px, with a background so the line does not cross them. (The 10 px React Flow attribution is the library's own link and stays.) | T4.10i |
| U9 | Builder, settings panel with no step | 1 Hierarchy | low | The panel starts with the sentence "Select a step on the canvas..." and the heading "Parameters" comes after it, so the panel has no title and the note looks like the heading. | Put the heading first and the sentence below it as a quiet note. | T4.10j |
| U10 | All screens | 2 Spacing | low | 6 px and 10 px values are in shared components: gaps of 6 px (fields, chips, navigation), 10 px (badges, table header cells, cell inputs, the brand), 9 px (version timeline), 13 and 14 px (the reference table list). The grid is 4, 8, 12, 16 px and so on. | Change them to the grid values without changing any fixed height that a rule checks (row heights, button heights, header y). | T4.10k |

## Later (not made into tasks)

These are real but small or large, and the limit is 12 tasks.

- L1. The step cards on a long flow are small at low zoom, so their text is under 12 px on screen. It is the zoom of the canvas, not a style. A minimum zoom, or a list view of the steps, is a feature for a later phase.
- L2. The reference table grid shows 100 rows of inputs and the page is 6000 px high; a virtual list would load faster. Not a flaw of the checklist.
- L3. Dates are written with a zero (`01 Jan 2026`) next to `19 Nov 2026`; it is one format everywhere, so it follows item 9, but `docs/DESIGN.md` writes `30 Sep 2026`. Decide once whether the zero stays, then change DESIGN or the code.
- L4. The 10 px React Flow attribution link at the bottom right of the canvas stays, because the library asks for it.

## Gates

None of the findings changes what a gate checks. U10 touches spacing values, so each of its steps keeps every height and y position that the UI rules check, and the whole of `test:ui-rules` runs after it.
