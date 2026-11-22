# UI review of Phase 7 (T7.19)

What was reviewed: every route of the UI rules (180 audits: each route in the light theme and the dark theme at 1440 px, made with
`playwright.ui-audit.config.ts`), the seven reference screens in `design/screens-harold/`, the drag of the canvas (the screenshots
of `npm run perf:canvas`, start, middle and end, and `e2e/canvas-drag.spec.ts`), every dialog and menu that has a route, the three
theme choices (`e2e/theme.spec.ts`), and Vietnamese text on six screens in both themes (a script looked for text cut by its own box
and read the screenshots). The full `npm run test:ui-rules` checks contrast with axe on every route, no gradient except the scene,
no card with a stripe on one side, font sizes from the type table, the Harold focus ring, and the drag-blur rule.

Checked and found fine: text and control contrast on the glass over the scene (no axe violation on any route in either theme);
Vietnamese text in the sidebar, the page headers, the tables and the buttons (no mark is cut off; the sidebar and the header show
"Luồng dữ liệu", "Các phiên bản", "Quản trị" whole); the three theme choices (Light, Dark, System, and System with no browser
preference gives dark); no gradient other than the scene; no card with a coloured stripe; the dragged canvas (no step disappears,
p95 frame 17 ms); every dialog and menu (surface-overlay, closes with Escape, top layer first).

Severity: high blocks a person, medium is visible and wrong, low is polish.

| # | Screen | Item | Severity | Finding | Fix |
| --- | --- | --- | --- | --- | --- |
| 1 | Versions (`/flows/:id/versions`), both themes, English and Vietnamese | Table fit | medium | The Actions column is wider than the table: at 1440 px the draft row with three buttons is cut at the right edge ("Copy to new ve…"), at 1280 px and in Vietnamese more so. The cells do not wrap (DESIGN) and the table scrolls inside its card without showing it. | Task T7.19a: the column widths, the wrapping of the note and the actions, with the 45 px row rule kept for English at 1280 and 1440 |
| 2 | Analyze file panel (builder, Test tab) | Hierarchy | low | "Left out" was an `h4` under an `h2`: the heading level jumped from 2 to 4. | Fixed here: it is an `h3` |
| 3 | Versions (timeline) | Ember | low | The draft segment of the timeline and the Draft badge of the table were both Ember: two uses on one screen, where Harold allows one. | Fixed here: the draft segment is a dashed `border-strong` outline on `surface-300`; Ember stays on the Draft badge, which the build uses for the Draft state and nowhere else. Flows and Reference tables show one Draft badge per draft row, which is the same use |
| 4 | All screens with a field in a row of controls | Audit measurement | low (tool) | The audit measured the 38 px input inside a field box, not the 40 px box, and reported "controls in a row have different heights (38, 40 px)" on 140 routes. The negative margins of the info button, the `auto` margins of a flex column and React Flow's own panel margins were also reported as off the spacing scale. | Fixed here in `ui-audit/audit.spec.ts`: the box of a field is the control that is measured; negative and `auto` margins are not spacing. React Flow's panel margins (15 px, 3 px) stay reported: they belong to the library |
| 5 | Builder, Reference tables rail, sidebar rail, Run | Alignment | low | A 32 px toggle or "Collapse" button above full-width controls, and compact buttons under full-width fields, are reported as controls of different widths. | Later: the pattern of the Phase 4 to 6 audits (D83, D86) and intended |
| 6 | Reference tables, import dialog (preview) | Alignment | low | Numbers in the preview of a file ("0.5", "1") are left-aligned: the preview shows the text of the cells before the column types are decided. | Later: the preview has no types yet; right-aligning guessed columns would be a behaviour change |
| 7 | Builder, parameter control | Spacing | low | The link button of a fixed field is pushed down by a margin that the code measures (29 px) so that it is level with the input box under its label. | Later: it keeps the button level (UI audit P6, finding 3); a fixed margin would break it when the label wraps |
| 8 | Dark theme, buttons with the `danger` variant | Colour | low | In dark the `danger` fill is a pale salmon (`#ffb0a9` with dark text) and stands out on a dark screen (Delete in a table row, Delete step). It is readable and is the Harold token, so it is not changed here. | Later: a decision for Harold if the paleness is too loud (Needs Harold) |
