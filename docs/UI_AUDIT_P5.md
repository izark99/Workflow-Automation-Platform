# UI audit, Phase 5 (T5.21)

Scope: the screens that Phase 5 added or changed, in both themes at 1440 px (the audit runs there), against the checklist in
`docs/DESIGN.md` ("UI quality checklist"). Method: `ui-audit` (a screenshot and measurements of every route of the UI rules,
`npm run test:ui-rules` leaves the build that it serves), then the screenshots were read one by one. The measurements also ran
at 1280 px in `npm run test:ui-rules`, which checks the hard rules (button sizes, title and first block y, table rows,
horizontal scroll, axe, pseudo-locale).

Screens reviewed: Flows with the sidebar rail and the inactivity dialog; Admin (Users, Texts, Settings, the edit text
dialog, the sidebar user popover); Reference tables as the admin (list, grid, import dialog empty, with a file, with
problems, columns dialog, description dialog) and as a user (tables of the own flows, the empty state); the builder with the
step list, the settings panel and both collapsed; the Run screen with the rail; the sign-in screen with the inactivity note.

Severity: high = a person can lose work or act by mistake; medium = a task is harder than it should be; low = looks off.

## Findings

| # | Screen | Item | Severity | Finding | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Admin, Texts tab | 3 | medium | A key longer than its 220 px column ran into the English column (`common.datePicker.previousMonth`, `signIn.problem.passwordMissing`) | The key is cut with an ellipsis and keeps its full text in `title`. e2e checks that the key ends before the next column | Fixed |
| 2 | Inactivity dialog | 8 | high | The first button in the DOM, "Sign out now", took the focus, so Enter signed the person out | `Dialog` focuses an element marked `data-autofocus`; "Stay signed in" is marked. e2e checks the focus | Fixed |
| 3 | Reference tables, import dialog | 4, 5 | high | The dialog scrolls, and the reason that Import is off and the problems under the columns were below the fold, so the admin saw a disabled button and no reason | The reason, the progress and a failure of the save are outside the scroll region; the first problem of a step is scrolled into view. e2e checks both | Fixed |
| 4 | Reference tables, list for a user | 3 | low | The "Used by" line wrapped to two lines and made the list item four lines tall | One line, cut with an ellipsis, full text in `title` | Fixed |
| 5 | Admin, Texts toolbar | 3 | low | The "Edited only" chip was 36 px next to 40 px controls (found by `ui-audit` in T5.20) | 40 px | Fixed in T5.20 |
| 6 | Admin, Settings tab | 3 | low | The Save button was 67 px wide under a 240 px field (found by `ui-audit` in T5.20) | As wide as the field | Fixed in T5.20 |
| 7 | Reference tables, version row | 3 | low | The "Published" badge text sits high in its pill next to the version chip | None of Phase 5 | Later: align the badge baseline (earlier phase) |
| 8 | Admin, Settings tab | 3 | low | The error under the field wraps at 240 px ("... from 1 to / 72") | A wider field or a wider error line | Later |

No finding needed a task of its own, so T5.21 adds no task.

## Checked and fine

- Hierarchy (1): one h1 per route, the Settings card title is an h2, no level jumps on the new routes.
- Spacing (2): the new CSS uses 4 px steps; the values that `ui-audit` still lists are `margin-top: auto` results, 1 px offsets of
  the hidden live region and the values of earlier phases (D86).
- Loading, empty and error states (4): the import dialog (reading, saving, read error, save error), the Texts and Settings
  tabs (skeleton, error with retry), the user's Reference tables (empty state with what to do), the Settings card.
- Forms (6): the Settings field and the import dialog show errors under the field once typed; Enter submits the Settings form.
- Unsaved changes (7): the Reference tables grid asks before leaving, also after a column change; the inactivity dialog says
  that unsaved changes will be lost.
- Keyboard (8): every panel toggle is reachable in reading order, Space and Enter work and the focus stays on the toggle;
  scroll regions of the import and columns dialogs are focusable; the Tab order of the edit text dialog is in D84.
- Motion (10): panel widths change in 200 ms and not at all with `prefers-reduced-motion` (e2e and `ui-audit`).
- Both themes (11): the rails, the quiet note on the sign-in screen, the dialogs and the Used by lines hold in the dark theme.
