# UI review of Phase 8 (T8.19)

What was reviewed: the full `npm run test:ui-rules` (5,925 tests in the light theme at 1280 and 1440 px and the dark theme at 1440 px,
all passing before the fixes below, with axe, the pseudo-locale check and every Phase 8 route), and a screenshot plus the script
measurements of 62 audits made with `playwright.ui-audit.config.ts` (each Phase 8 route in both themes at 1440 px): the canvas with
its controls and the toast of Auto arrange, the selection toolbar with Snap to grid on, a step dragged over an edge, the Duplicate
button and its toast, the preview popup in four states (rows, Find with matches, Find with no match, no rows), the card and the
Configure or Test tab of Sort, Remove duplicates, Top N, Split column, Clean text, Check and Compare in each of their states, the
canvas of a flow that holds all seven steps and the Run screen of that flow. The step list with its three new groups was read in
English and in Vietnamese (a script looked for text cut by its own box in the step list, the cards and the toolbars: none).

Checked and found fine: contrast in both themes (no axe violation on any route); Vietnamese text in the step list, on the cards and
in the forms (no mark cut, no clipped label); the toast of Auto arrange (surface-overlay, compact Undo button, dismiss button, fits
beside the canvas controls); the cards with their icon and the names of their handles (`kept`, `removed`, `ok`, `errors`, `added`,
`removed`, `changed`, and the two inputs of Compare); the forms (labels, hints behind info buttons, parameter buttons, notes that say
what is still missing); the popup (title, chips, Find with its count, the message of rows shown, Escape and focus return, the dialog
is one `surface-overlay` layer over the scrim); the drag of the canvas (`npm run perf:canvas`: p95 frame 17 ms for 12, 60 and 70
steps, no step disappears).

Severity: high blocks a person, medium is visible and wrong, low is polish.

| # | Screen | Item | Severity | Finding | Fix |
| --- | --- | --- | --- | --- | --- |
| 1 | Canvas, selection toolbar | Placement | medium | With the selected steps near the top edge of the canvas the toolbar was drawn above them, half outside the canvas and under the header, so its buttons could not be used. | Fixed in T8.19a: the toolbar goes below the steps when there is less than 60 px above them; `e2e/align.spec.ts` pans the steps to the top edge and checks that the bar is inside the canvas |
| 2 | Preview popup | Alignment | medium | The column of row numbers took an equal share of the table: with two columns of data it was about 430 px wide and the numbers sat far from the data. | Fixed in T8.19b: the column is as wide as its numbers (at least 64 px); `e2e/preview-popup.spec.ts` checks that it is under 120 px |
| 3 | Preview popup | Alignment | low | The toolbar row mixed a 40 px field with a 32 px "Show more" button (reported by the audit: "controls in a row have different heights"). | Fixed in T8.19c: "Show more" is a 40 px button like the field (DESIGN said compact; one height in a row is the rule of the audit) |
| 4 | Preview popup, Test tab | Spacing | low | The messages of the preview are `p` elements with the 13 px margin of the browser, off the Harold spacing scale (reported by the audit on the popup routes). | Fixed in T8.19d: the `muted` text has no margin of its own; the blocks space it with their gap |
| 5 | Check form | Redundancy | low | The form had a "Load columns from test file" button on top and each rule's formula editor has its own: two of them on one screen. | Fixed in T8.19e: the form has no button of its own; each editor loads the columns that all rules share |
| 6 | Step list, English | Fit | low | "Remove duplicates" fills its button up to the edge (the 184 px list, a 16 px icon and 12 px paddings leave no air on the right). Not cut off in English or in Vietnamese ("Làm sạch văn bản" is the longest). | Later: the label fits; a shorter gap or a narrower icon would change every button of the list |
| 7 | Toast | Spacing | low | The dismiss button of the toast has 6 px side padding (off the scale, reported on the Auto arrange route). | Later: it comes from the toast of Phase 4 and is the same on every screen; the button is 32 px as the rules ask |
| 8 | Canvas controls | Spacing | low (library) | React Flow's own panel margins (15 px, 3 px) are reported on every canvas route. | Later: they belong to the library (as in the audit of Phase 7) |
| 9 | Settings panel, parameter control | Alignment | low | The link button of a fixed field is 29 px down (reported on the routes with a parameter control). | Later: the pattern of UI audit P6, finding 3 |
| 10 | Settings panel, Expand and Load columns | Alignment | low | A 32 px Expand button, "Load columns" and "Add rule" or "Add sort key" are reported as controls of different widths in a column. | Later: the pattern of the audits of Phases 4 to 7 (compact buttons under full-width fields), intended |
