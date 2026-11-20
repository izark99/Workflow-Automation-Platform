# UI audit, Phase 6 (T6.22)

Scope: the screens that Phase 6 added or changed, in both themes at 1440 px (the audit runs there), against the checklist in
`docs/DESIGN.md` ("UI quality checklist"). Method: `ui-audit` (a screenshot and measurements of every route of the UI rules,
`npm run test:ui-rules` leaves the build that it serves), then the screenshots were read one by one. The hard rules (button
sizes, title and first block y, table rows, horizontal scroll, axe, pseudo-locale) ran in `npm run test:ui-rules` in the light
theme at 1280 and 1440 px and in the dark theme at 1440 px. The canvas was checked while a step is dragged, at the start, the
middle and the end of the drag (`npm run perf:canvas` saves the three screenshots in `docs/canvas-perf/`).

Screens reviewed: the builder while dragging a step (12, 60 and 70 steps); the Input file step (Configure with the parameter
control, the region settings, the Test tab with the analysis panel: no file, reading, a clear result, an ambiguous result, no
table found, an error); a field that uses a parameter (bound, deleted parameter, the value now, a value that cannot be used);
the Reference table step (no table, table chosen, no version, a table not found, the date check); the publish dialog with the
date check; the Run screen with a group of settings that use a parameter, the date check warning and an error.

Severity: high = a person can lose work or act by mistake; medium = a task is harder than it should be; low = looks off.

## Findings

| # | Screen | Item | Severity | Finding | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Reference table step, Configure | 1, 6 | medium | The Table dropdown had no visible label; only its accessible name said "Table" | A visible "Table" label above the dropdown, same style as the other forms | Fixed |
| 2 | Reference table step, no version | 5 | low | The error repeated the advice that the engine message already gives ("Pick an effective date ... or add a version") | The error shows the engine message only; the unused text was removed from the catalog | Fixed |
| 3 | Every form with a parameter control | 3 | medium | The link button sat level with the field label, not with the input box, in every form that has the control | The control measures where the input starts and puts the button level with it (the info button of the label is left out) | Fixed |
| 4 | Builder, dragging | 4 | high | During a drag the cards of the other steps could disappear | Fixed in T6.1 to T6.3 (D87). The start, middle and end screenshots show every card, and e2e counts them | Fixed earlier |
| 5 | Canvas at the fit zoom of 70 steps | 3 | low | At 20 % the text of the cards cannot be read | A fit zoom that never goes below what is readable would hide the rest of the flow; the person zooms in | Later |
| 6 | Reference tables, import dialog | 3 | low | A number in the preview table ("0.5", "1") is not right-aligned | None of Phase 6 | Later: align numbers in the import preview (Phase 5 screen) |
| 7 | Run screen, date check warning | 3 | low | The warning line and the Run button have different widths in one column | By design: the button keeps its size | No change |

The other lines that `ui-audit` lists are known and not findings of Phase 6: the 10 px link "React Flow" of the canvas library
(item 9), and the 36 px icon buttons next to full-width buttons or fields (item 3, an icon button is not part of a set of
controls).

No finding needed a task of its own, so T6.22 adds no follow-up task.

## Checked and fine

- Hierarchy (1): one h1 per route, the analysis panel and the Reference table form use the same heading levels as the other forms.
- Spacing (2): the new CSS uses 4 px steps; the control's offset is a measured value rounded to whole pixels, always a multiple
  of 4 in the forms (label height plus gap).
- Alignment (3): the controls of the new screens have one height per row; the parameter control button is level with the input.
- Loading, empty and error states (4): the analysis panel (no file, reading, no table found, an error), the Reference table
  step (no table, no version, a table not found), the parameter control (a deleted parameter, a value that cannot be used).
- Forms (6): errors are shown under the field; a bound field shows its name, the parameter and "Now: value".
- Keyboard (8): the parameter link button, the analysis panel and its scroll region are reachable; the axe rule
  `scrollable-region-focusable` holds.
- Motion (10): no new transition over 200 ms; nothing moves with `prefers-reduced-motion`.
- Both themes (11): the chips, the confidence badges, the date check warning and the dialogs hold in the dark theme.
