import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { compareWorkbooks, formatComparison, readWorkbook } from '../scripts/lib/compare-workbooks';
import { clearLayouts, type Layout } from '../scripts/lib/layout-fixtures';
import { xlsxBytes, type FixtureCell } from '../scripts/lib/refimport-fixtures';
import type { RunReply } from './page';

// SPEC 13.2 / G1: files made by a script, whose table sits inside a larger sheet (a title block above, a footer below, merged
// cells, a later header row and column, csv as well), run through the real engine in Chromium with the region settings of
// the Input step. The output workbook must equal the table that the generator says is in the file, cell by cell. Nothing
// from `testcase/` is read: the files and the expected rows come from `scripts/lib/layout-fixtures.ts`.
const SHEET = 'Rows';

async function run(page: Page, layout: Layout, overrides: Record<string, unknown> = {}): Promise<RunReply> {
  await page.goto('/acceptance/index.html');
  await page.waitForFunction(() => typeof window.runDataset === 'function');
  const t = layout.truth!;
  const flow = {
    schemaVersion: 1,
    nodes: [
      {
        id: 'in',
        type: 'input_file',
        settings: {
          key: 'File',
          ...(t.sheet === undefined ? {} : { sheet: t.sheet }),
          headerRow: t.headerRow,
          firstColumn: t.firstColumn,
          lastColumn: t.lastColumn,
          stopAt: t.stop,
          ignoreRows: t.ignoreRows,
          fillDown: t.fillDown,
          // A column with no name in the file has no name to require.
          expect: t.columns.filter((c) => !/^Column \d+$/.test(c)),
          ...overrides,
        },
      },
      { id: 'out', type: 'output', settings: { file: 'Result', format: 'xlsx', sheet: SHEET } },
    ],
    edges: [{ source: 'in', target: 'out' }],
  };
  const base64 = Buffer.from(layout.file.bytes).toString('base64');
  return page.evaluate((a) => window.runDataset(a), { flow, effectiveDate: '2026-09-30', files: { File: { name: layout.file.name, base64 } } });
}

/** The table that the layout holds, as a workbook: dates are date cells, as the engine writes them. */
function expectedBook(layout: Layout) {
  const t = layout.truth!;
  // A csv file has no cell types: a text such as 2026-09-01 is read as a date. In xlsx it stays a text.
  const dates = new Set(layout.format === 'csv' ? [...t.dateColumns, 'Text day'] : t.dateColumns);
  const rows: FixtureCell[][] = [
    t.columns,
    ...t.rows.map((row) => row.map((v, c) => (dates.has(t.columns[c]!) && typeof v === 'string' ? new Date(`${v}T00:00:00Z`) : v))),
  ];
  return readWorkbook(new Uint8Array(xlsxBytes([{ name: SHEET, rows }])));
}

for (const layout of clearLayouts()) {
  test(`${layout.name}: the engine reads the table and equals the expected rows cell by cell`, async ({ page }) => {
    const reply = await run(page, layout);
    if (!reply.ok) throw new Error(`The engine stopped (${reply.code}): ${reply.message}`);
    expect(reply.files.map((f) => f.name)).toEqual(['Result.xlsx']);
    const actual = readWorkbook(new Uint8Array(Buffer.from(reply.files[0]!.base64, 'base64')));
    const comparison = compareWorkbooks(expectedBook(layout), actual, [SHEET]);
    expect(comparison.ok, formatComparison(comparison)).toBe(true);
    // The header and every row of the truth were compared.
    expect(comparison.comparedCells).toBeGreaterThanOrEqual((layout.truth!.rows.length + 1) * layout.truth!.columns.length - layout.truth!.rows.length);
  });
}

test('the same layout without its region settings is not the same table: the test can fail', async ({ page }) => {
  const layout = clearLayouts().find((l) => l.name === 'title-and-footer (xlsx)')!;
  // Reading from the first row, with no stop rule, takes the title for the header: the table is different.
  const reply = await run(page, layout, { headerRow: 1, firstColumn: 1, lastColumn: undefined, stopAt: { kind: 'end' }, expect: [] });
  if (!reply.ok) return; // a stop with a message is also a difference
  const actual = readWorkbook(new Uint8Array(Buffer.from(reply.files[0]!.base64, 'base64')));
  const comparison = compareWorkbooks(expectedBook(layout), actual, [SHEET]);
  expect(comparison.ok).toBe(false);
});

test('a file that lacks a column that the step requires stops the run before any step, and says which column and what the file has', async ({ page }) => {
  const layout = clearLayouts().find((l) => l.name === 'later-row-and-column (csv)')!;
  const reply = await run(page, layout, { expect: ['Code', 'Stock level'] });
  expect(reply.ok).toBe(false);
  if (reply.ok) return;
  expect(reply.code).toBe('file_read_failed');
  expect(reply.message).toContain('"Stock level"');
  expect(reply.message).toContain('Code, Label, Group, Amount, Day, Text day');
});
