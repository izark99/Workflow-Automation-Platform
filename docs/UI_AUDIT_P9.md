# UI review of Phase 9 (T9.19)

What was reviewed: every Phase 9 route of the UI rules in both themes at 1440 px with `playwright.ui-audit.config.ts` (38 audits: the print
group of the Output form off, on with the defaults, filled, with errors and at the limits; the print preview with no rows yet, with no
rows, one page, first and last page and the large dialog; the link dialog with nothing chosen, with a table and a column, with a table
left out for a cycle and with a table that has no column; the New table dialog with the switch; a linked table with its line and its
draft; the notice with "Open the draft"; the draft with the "New" and "Not in A any more" chips; the publish dialog with the warning;
the sidebar rail with the dot), the screenshots of those routes at a tall viewport (the settings panel and the pages are seen whole, not
cut at 900 px), and the script measurements of the audit. The full `npm run test:ui-rules` runs in T9.20.

Checked and found fine: contrast in both themes (no axe violation on any Phase 9 route); the print group wraps its controls onto two rows
and nothing scrolls sideways at 380 px; the link dialog (420 px, the note about the tables that were left out, the count line); the
notice block (the quiet warning, the compact button); the chips in the leading cell of a linked table; the dot (8 px, primary) in the open
sidebar and in the rail; the pages of the print preview in both themes (neutral surface, text in ink, the paper ratio of A4 portrait and of
landscape); the large dialog (title, the two pages, the note, Escape and focus return).

Severity: high blocks a person, medium is visible and wrong, low is polish.

| # | Screen | Item | Severity | Finding | Fix |
| --- | --- | --- | --- | --- | --- |
| 1 | Test tab, print preview | Hierarchy | high | The print preview was drawn under the table of the first 100 rows, so a person had to scroll past about 4,500 px of rows to find it. | T9.19a: the print preview is drawn above the table of rows, right after the buttons |
| 2 | Print group | Alignment | medium | The remove button of a header line and of a signer was 32 px high next to a 40 px field (the audit: "controls in a row have different heights (40, 32 px)"). | T9.19b: the remove buttons are 40 px, like the remove button of a sort key |
| 3 | Print group | Consistency | low | "Page", "Header lines" and "Signatures" were bold (700) while the other section labels of the form ("Sort rows by") are 500. | T9.19c: the three titles use the label of the form (`SectionLabel`) |
| 4 | UI audit | Tooling | low | The audit reports "text under 12 px" for the drawing of a page (8 px scale of DESIGN, D138). | T9.19d: the audit skips `[data-drawing]` as the UI rule does |
| 5 | Print preview, drawing | Alignment | low | A number column is drawn left-aligned (the table of the preview and the file right-align numbers). | Later: the page model does not carry the types of the columns; the drawing is approximate |
| 6 | Print preview, large dialog | Fit | low | The pages are 460 px wide in a dialog of more than 1,300 px, so the text is 12 px and the free area is empty. | Later: a larger scale would help a long header; the dialog follows the popup of Phase 8 |
| 7 | Linked table | Fit | low | The leading cell with the chips takes an equal share of the table (about a quarter), as every column of this table does. | Later: a narrower first column needs a width option on the table component |
| 8 | Print group, Output form | Alignment | low | "Add sort key", "Add line" and "Add signer" are compact buttons under full-width fields: reported as controls of different widths in a column. | Later: the pattern of the audits of Phases 4 to 8, intended |
| 9 | Canvas, settings panel | Spacing | low (library, old) | React Flow's own panel margins and the 29 px margin of the parameter link button are reported on every canvas route. | Later: the patterns of the audits of Phases 6 to 8 |

## Tasks

- T9.19a The print preview above the table of rows (finding 1).
- T9.19b The remove buttons of the print group are 40 px (finding 2).
- T9.19c The titles of the print group use the label of the form (finding 3).
- T9.19d The audit skips the drawing of a page (finding 4).
