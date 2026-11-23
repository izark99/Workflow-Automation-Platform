import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedRunnableFlow } from './runnable-flow';
import { seedSnapshot } from '../src/store/seed';

const URL = '/reference-tables';
const grid = (page: Page, name: string) => page.getByRole('table', { name: `Rows of ${name}` });
const gridRows = (page: Page, name: string) => grid(page, name).locator('tbody tr');
const toastWith = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
/** The actions that are not on the toolbar: Edit description, Columns, Paste from Excel, New version (of a draft). */
const fromMenu = async (page: Page, item: string) => {
  await page.getByRole('button', { name: /^More actions for this table/ }).click();
  await page.getByRole('option', { name: item, exact: true }).click();
};
const list = (page: Page) => page.getByRole('list', { name: 'Reference tables' });
const seed = async (page: Page, change: (s: ReturnType<typeof seedSnapshot>) => void) => {
  const s = seedSnapshot();
  change(s);
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
};
/** A draft table of 250 rows (id, value), for paging and editing. */
const withBigDraft = (s: ReturnType<typeof seedSnapshot>) => {
  s.refTables.push({
    id: 'ref-big',
    name: 'Big list',
    description: 'A long table for paging.',
    versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'draft', columns: [{ name: 'id', type: 'text' }, { name: 'value', type: 'number' }], rows: Array.from({ length: 250 }, (_, i) => [`r${i + 1}`, i + 1]) }],
  });
};

test('the list shows the tables with their row counts and the version in effect; the first is selected', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Reference tables', level: 1 })).toBeVisible();
  const items = list(page).getByRole('link');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('Attendance codes');
  await expect(items.nth(0)).toContainText('8 rows, v2 in effect');
  await expect(items.nth(1)).toContainText('OT types');
  await expect(items.nth(1)).toContainText('4 rows, v1 in effect');
  await expect(items.nth(2)).toContainText('2 rows, v1 in effect');
  await expect(items.nth(0)).toHaveAttribute('aria-current', 'true');
});

test('a published version shows its rows as text and is read-only; the version chips switch versions', async ({ page }) => {
  await page.goto(URL);
  await expect(grid(page, 'Attendance codes').getByRole('columnheader')).toHaveText(['code', 'description', 'work_day_value', 'day_category', 'ot_type']);
  await expect(gridRows(page, 'Attendance codes')).toHaveCount(8);
  await expect(gridRows(page, 'Attendance codes').first()).toContainText('Day shift worked');
  await expect(grid(page, 'Attendance codes').getByRole('textbox')).toHaveCount(0);
  await expect(page.getByText('A published version is read-only: create a new version to change its rows.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Paste from Excel' })).toHaveCount(0);
  const chips = page.getByRole('group', { name: 'Versions of the table' });
  await expect(chips.getByRole('button', { name: 'v2, from 01 Jul 2026' })).toHaveAttribute('aria-pressed', 'true');
  await chips.getByRole('button', { name: 'v1, 01 Jan 2026 to 30 Jun 2026' }).click();
  await expect(page).toHaveURL(/table=ref-attendance&v=1/);
  await expect(chips.getByRole('button', { name: /^v1,/ })).toHaveAttribute('aria-pressed', 'true');
});

test('choosing another table shows its rows; numbers are right-aligned', async ({ page }) => {
  await page.goto(URL);
  await list(page).getByRole('link', { name: /OT types/ }).click();
  await expect(page).toHaveURL(/table=ref-ot-types/);
  await expect(gridRows(page, 'OT types')).toHaveCount(4);
  const align = await gridRows(page, 'OT types').first().locator('td').nth(2).evaluate((el) => getComputedStyle(el).textAlign);
  expect(align).toBe('right');
  expect(Math.round((await gridRows(page, 'OT types').first().boundingBox())!.height)).toBe(37); // the grid uses dense rows
});

test('New version copies the version as a draft; its cells are editable; save keeps them; publish ends the previous version and makes it read-only', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'New version', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New version from v2' });
  await dialog.getByRole('button', { name: 'Create version' }).click();
  await expect(toastWith(page, 'v3 created as a draft.')).toBeVisible();
  await expect(gridRows(page, 'Attendance codes')).toHaveCount(8);
  const cell = page.getByRole('textbox', { name: 'Row 1, description' });
  await expect(cell).toHaveValue('Day shift worked');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await cell.fill('Day shift');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(toastWith(page, 'Changes saved.')).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Row 1, description' })).toHaveValue('Day shift');

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const publish = page.getByRole('dialog', { name: 'Publish v3?' });
  await expect(publish).toContainText('Publishing v3 will end v2 on');
  await publish.getByRole('button', { name: 'Publish' }).click();
  await expect(toastWith(page, 'v3 published.')).toBeVisible();
  await expect(grid(page, 'Attendance codes').getByRole('textbox')).toHaveCount(0);
  await expect(page.getByText('A published version is read-only')).toBeVisible();
});

test('a value of the wrong type is not saved: the message names the row and the column and what to type', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'New version', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create version' }).click();
  const cell = page.getByRole('textbox', { name: 'Row 2, work_day_value' });
  await cell.fill('abc');
  await page.getByRole('button', { name: 'Save changes' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('1 cell is not valid, so nothing was saved.');
  await expect(alert).toContainText('Row 2, work_day_value: "abc" is not a number');
  await expect(cell).toHaveAttribute('aria-invalid', 'true');
  await cell.fill('0.5');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(toastWith(page, 'Changes saved.')).toBeVisible();
});

test('rows can be added and removed in a draft', async ({ page }) => {
  await seed(page, withBigDraft);
  await page.goto(`${URL}?table=ref-big&v=1`);
  await expect(page.getByText('Rows 1 to 100 of 250.')).toBeVisible();
  await page.getByRole('button', { name: 'Add row' }).click();
  await expect(page.getByText('Rows 201 to 251 of 251.')).toBeVisible(); // the new row is on the last page
  await page.getByRole('button', { name: 'Remove row 251' }).click();
  await expect(page.getByText(/of 250\./)).toBeVisible();
});

test('a long table is shown in pages of 100 rows and edits on another page are kept', async ({ page }) => {
  await seed(page, withBigDraft);
  await page.goto(`${URL}?table=ref-big&v=1`);
  await expect(gridRows(page, 'Big list')).toHaveCount(100);
  await expect(page.getByRole('button', { name: 'Previous rows' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next rows' }).click();
  await expect(page.getByText('Rows 101 to 200 of 250.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Row 101, id' })).toHaveValue('r101');
  await page.getByRole('textbox', { name: 'Row 101, id' }).fill('changed');
  await page.getByRole('button', { name: 'Previous rows' }).click();
  await page.getByRole('button', { name: 'Next rows' }).click();
  await expect(page.getByRole('textbox', { name: 'Row 101, id' })).toHaveValue('changed');
  await page.getByRole('button', { name: 'Next rows' }).click();
  await expect(gridRows(page, 'Big list')).toHaveCount(50);
  await expect(page.getByRole('button', { name: 'Next rows' })).toBeDisabled();
});

test('Paste from Excel replaces the rows: a header row is skipped and cells go by column name; a bad paste is refused with what to do', async ({ page }) => {
  await seed(page, withBigDraft);
  await page.goto(`${URL}?table=ref-big&v=1`);
  await fromMenu(page, 'Paste from Excel');
  const dialog = page.getByRole('dialog', { name: 'Paste from Excel' });
  await dialog.getByRole('textbox', { name: 'Pasted cells' }).fill('a\tb\tc\td\te');
  await dialog.getByRole('button', { name: 'Use these rows' }).click();
  await expect(dialog.getByRole('alert')).toContainText('has 5 cells, but the table has 2 columns');
  await dialog.getByRole('textbox', { name: 'Pasted cells' }).fill('VALUE\tid\n7\tx1\n8\tx2');
  await dialog.getByRole('button', { name: 'Use these rows' }).click();
  await expect(page.getByText('Pasted 2 rows. Check them, then save.')).toBeVisible();
  await expect(gridRows(page, 'Big list')).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Row 1, id' })).toHaveValue('x1');
  await expect(page.getByRole('textbox', { name: 'Row 1, value' })).toHaveValue('7');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(toastWith(page, 'Changes saved.')).toBeVisible();
  await page.reload();
  await expect(gridRows(page, 'Big list')).toHaveCount(2);
});

test('a paste straight into a cell starts at that cell; a single value goes into the cell as usual', async ({ page }) => {
  await seed(page, withBigDraft);
  await page.goto(`${URL}?table=ref-big&v=1`);
  const target = page.getByRole('textbox', { name: 'Row 2, id' });
  await target.focus();
  await page.evaluate(() => {
    const el = document.querySelector('input[aria-label="Row 2, id"]')!;
    const dt = new DataTransfer();
    dt.setData('text/plain', 'p\t10\nq\t20\n');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole('textbox', { name: 'Row 2, id' })).toHaveValue('p');
  await expect(page.getByRole('textbox', { name: 'Row 3, value' })).toHaveValue('20');
  await expect(page.getByRole('textbox', { name: 'Row 1, id' })).toHaveValue('r1');
});

test('New table is made from a pasted header row and rows; numbers get the number type', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'New table' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New reference table' });
  await dialog.getByRole('button', { name: 'Create table' }).click();
  await expect(dialog.getByRole('alert')).toContainText('The table has no name.');
  await dialog.getByRole('textbox', { name: 'Table name' }).fill('Holidays');
  await dialog.getByRole('textbox', { name: 'What the table holds' }).fill('Public holidays');
  await dialog.getByRole('textbox', { name: 'Header row and rows from Excel' }).fill('day\tname\tdays\n2026-09-02\tNational Day\t1\n2026-04-30\tReunification\t2');
  await dialog.getByRole('button', { name: 'Create table' }).click();
  await expect(page).toHaveURL(/table=ref-\d+&v=1/);
  await expect(grid(page, 'Holidays').getByRole('columnheader')).toHaveText(['day', 'name', 'days', '']);
  await expect(page.getByRole('textbox', { name: 'Row 1, day', exact: true })).toHaveValue('2026-09-02');
  await expect(list(page).getByRole('link', { name: /Holidays/ })).toContainText('2 rows, v1 (draft)');
  const align = await grid(page, 'Holidays').locator('tbody tr').first().locator('td').nth(2).evaluate((el) => getComputedStyle(el).textAlign);
  expect(align).toBe('right');
});

test('New table refuses a header with a repeated name', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'New table' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New reference table' });
  await dialog.getByRole('textbox', { name: 'Table name' }).fill('Bad');
  await dialog.getByRole('textbox', { name: 'Header row and rows from Excel' }).fill('a\tA\n1\t2');
  await dialog.getByRole('button', { name: 'Create table' }).click();
  await expect(dialog.getByRole('alert')).toContainText('"A" appears twice');
});

test('leaving a table with unsaved changes asks first', async ({ page }) => {
  await seed(page, withBigDraft);
  await page.goto(`${URL}?table=ref-big&v=1`);
  await page.getByRole('textbox', { name: 'Row 1, id' }).fill('changed');
  await list(page).getByRole('link', { name: /Attendance codes/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(/table=ref-big/);
  await expect(page.getByRole('textbox', { name: 'Row 1, id' })).toHaveValue('changed');
  await list(page).getByRole('link', { name: /Attendance codes/ }).click();
  await dialog.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/table=ref-attendance/);
});

test('a table says which flows read it', async ({ page }) => {
  await seedRunnableFlow(page);
  await page.goto(`${URL}?table=ref-ot-limits`);
  await expect(page.getByText('Used by Run test flow.')).toBeVisible();
  await list(page).getByRole('link', { name: /OT types/ }).click();
  await expect(page.getByText('No flow reads this table yet.')).toBeVisible();
});

test('a user who is not the admin can read the tables that their flows read but cannot create or change one', async ({ page }) => {
  // Since SPEC 12.1 the rows are read through a flow: this user has one personal flow that reads "Attendance codes".
  await seed(page, (s) => {
    s.currentUserId = 'user-lan';
    const definition = { schemaVersion: 1, nodes: [{ id: 'L', type: 'lookup_join', label: 'L', position: { x: 0, y: 0 }, settings: { source: { kind: 'reference', table: 'Attendance codes' }, keys: [], bring: [], onNoMatch: 'blank' } }], edges: [] };
    s.flows.push({ id: 'flow-lan-codes', name: 'Lan codes', ownerId: 'user-lan', scope: 'personal', deletedAt: null, groupIds: [], versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', changeNote: '', definition }] });
  });
  await page.goto(URL);
  await expect(list(page).getByRole('link')).toHaveCount(1);
  await expect(gridRows(page, 'Attendance codes')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'New table' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New version', exact: true })).toHaveCount(0);
  await expect(page.getByText('Only the admin can change reference tables.')).toBeVisible();
});

test('with no tables the empty state offers New table to the admin', async ({ page }) => {
  await seed(page, (s) => (s.refTables = []));
  await page.goto(URL);
  await expect(page.getByText('No reference tables yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New table' })).toHaveCount(2); // the header action and the empty state
});

test.describe('table list rail', () => {
  const panel = (page: Page) => page.locator('#ref-list-panel');
  const panelWidth = async (page: Page) => Math.round((await panel(page).boundingBox())!.width);

  test('the list collapses to 48 px, the grid takes the space, and the choice is kept after a reload', async ({ page }) => {
    await page.goto(URL);
    expect(await panelWidth(page)).toBe(260);
    const detail = page.getByRole('region', { name: 'Table details' });
    const before = (await detail.boundingBox())!.width;
    await page.getByRole('button', { name: 'Collapse table list' }).click();
    await expect.poll(() => panelWidth(page)).toBe(48);
    await expect(page.getByRole('button', { name: 'Expand table list' })).toBeFocused();
    await expect(list(page)).toBeHidden();
    expect((await detail.boundingBox())!.width).toBeGreaterThan(before + 150);
    await page.reload();
    await expect.poll(() => panelWidth(page)).toBe(48);
    await page.getByRole('button', { name: 'Expand table list' }).click();
    await expect.poll(() => panelWidth(page)).toBe(260);
    await expect(list(page).getByRole('link')).toHaveCount(3);
  });

  test('collapsing the list does not lose unsaved edits', async ({ page }) => {
    await seed(page, withBigDraft);
    await page.goto(`${URL}?table=ref-big&v=1`);
    await page.getByRole('textbox', { name: 'Row 1, id' }).fill('edited');
    await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse table list' }).click();
    await expect.poll(() => panelWidth(page)).toBe(48);
    await expect(page.getByRole('textbox', { name: 'Row 1, id' })).toHaveValue('edited');
    await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();
    await page.getByRole('button', { name: 'Expand table list' }).click();
    await expect(page.getByRole('textbox', { name: 'Row 1, id' })).toHaveValue('edited');
    // The guard still asks when a table is chosen from the list.
    await list(page).getByRole('link', { name: /Attendance codes/ }).click();
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  });
});

test.describe('adjust a draft', () => {
  const small = (s: ReturnType<typeof seedSnapshot>) => {
    s.refTables.push({
      id: 'ref-small',
      name: 'Small draft',
      description: 'Before',
      versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'draft', columns: [{ name: 'code', type: 'text' }, { name: 'limit', type: 'number' }], rows: [['A', 1], ['B', 2]] }],
    });
  };
  const SMALL = `${URL}?table=ref-small&v=1`;
  const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Columns of the draft' });

  test('edit a cell, add a row and remove a row, then save', async ({ page }) => {
    await seed(page, small);
    await page.goto(SMALL);
    await page.getByRole('textbox', { name: 'Row 1, code' }).fill('A2');
    await page.getByRole('button', { name: 'Add row' }).click();
    await page.getByRole('textbox', { name: 'Row 3, code' }).fill('C');
    await page.getByRole('textbox', { name: 'Row 3, limit' }).fill('3');
    await page.getByRole('button', { name: 'Remove row 2' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(toastWith(page, 'Changes saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Row 1, code' })).toHaveValue('A2');
    await expect(page.getByRole('textbox', { name: 'Row 2, code' })).toHaveValue('C');
    await expect(gridRows(page, 'Small draft')).toHaveCount(2);
  });

  test('add, rename, change the type of and remove columns; the grid follows, and Save keeps them', async ({ page }) => {
    await seed(page, small);
    await page.goto(SMALL);
    await fromMenu(page, 'Columns');
    const d = dialogOf(page);
    expect(await d.evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(640);
    await d.getByRole('textbox', { name: 'Name of column 1' }).fill('Code of day');
    await d.getByRole('button', { name: /^Type of column 2/ }).click();
    await page.getByRole('option', { name: 'Text' }).click();
    await d.getByRole('button', { name: 'Add column' }).click();
    await d.getByRole('textbox', { name: 'Name of column 3' }).fill('When');
    await d.getByRole('button', { name: /^Type of column 3/ }).click();
    await page.getByRole('option', { name: 'Date' }).click();
    await d.getByRole('button', { name: 'Apply' }).click();
    await expect(grid(page, 'Small draft').getByRole('columnheader')).toHaveText(['Code of day', 'limit', 'When', '']);
    await expect(page.getByRole('textbox', { name: 'Row 1, Code of day' })).toHaveValue('A');
    await expect(page.getByRole('textbox', { name: 'Row 1, When' })).toHaveValue('');
    await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Row 1, When' }).fill('2026-09-30');
    // Remove the second column.
    await fromMenu(page, 'Columns');
    await dialogOf(page).getByRole('button', { name: 'Remove column 2' }).click();
    await dialogOf(page).getByRole('button', { name: 'Apply' }).click();
    await expect(grid(page, 'Small draft').getByRole('columnheader')).toHaveText(['Code of day', 'When', '']);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(toastWith(page, 'Changes saved.')).toBeVisible();
    await page.reload();
    await expect(grid(page, 'Small draft').getByRole('columnheader')).toHaveText(['Code of day', 'When', '']);
    await expect(page.getByRole('textbox', { name: 'Row 1, When' })).toHaveValue('2026-09-30');
    await expect(page.getByRole('textbox', { name: 'Row 2, Code of day' })).toHaveValue('B');
  });

  test('a repeated or empty column name and a table with no columns keep Apply off and say what to do', async ({ page }) => {
    await seed(page, small);
    await page.goto(SMALL);
    await fromMenu(page, 'Columns');
    const d = dialogOf(page);
    await d.getByRole('textbox', { name: 'Name of column 2' }).fill('CODE');
    await expect(d.getByRole('alert')).toContainText('The name "CODE" is used by columns 1 and 2');
    await expect(d.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await d.getByRole('textbox', { name: 'Name of column 2' }).fill('');
    await expect(d.getByRole('alert')).toContainText('Column 2 has no name.');
    await d.getByRole('button', { name: 'Remove column 2' }).click();
    await d.getByRole('button', { name: 'Remove column 1' }).click();
    await expect(d.getByRole('alert')).toContainText('at least one column');
    await expect(d.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  test('a changed type checks the cells when the draft is saved, and nothing is saved on an error', async ({ page }) => {
    await seed(page, small);
    await page.goto(SMALL);
    await fromMenu(page, 'Columns');
    await dialogOf(page).getByRole('button', { name: /^Type of column 1/ }).click();
    await page.getByRole('option', { name: 'Number' }).click();
    await dialogOf(page).getByRole('button', { name: 'Apply' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/cells are not valid|cell is not valid/)).toBeVisible();
    await page.reload();
    await expect(grid(page, 'Small draft').getByRole('columnheader').first()).toHaveText('code');
  });

  test('the admin changes the description of a table; the name stays; also on a published table', async ({ page }) => {
    await page.goto(URL);
    await fromMenu(page, 'Edit description');
    const d = page.getByRole('dialog', { name: 'Description of the table' });
    await d.getByRole('textbox', { name: 'What the table holds' }).fill('Codes of the day');
    await d.getByRole('button', { name: 'Save description' }).click();
    await expect(toastWith(page, 'Description saved.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Attendance codes', level: 2 })).toBeVisible();
    await expect(page.getByText('Codes of the day')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Codes of the day')).toBeVisible();
  });

  test('a published version stays read-only: no Columns button, no inputs; a user has no description button', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByRole('button', { name: 'Columns', exact: true })).toHaveCount(0);
    await expect(grid(page, 'Attendance codes').getByRole('textbox')).toHaveCount(0);
    const s = { ...seedSnapshot(), currentUserId: 'user-lan' };
    await page.addInitScript((j) => localStorage.setItem('dfw.seed', j), JSON.stringify(s));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit description' })).toHaveCount(0);
  });

  test('changed columns count as unsaved changes: leaving the table asks first', async ({ page }) => {
    await seed(page, small);
    await page.goto(SMALL);
    await fromMenu(page, 'Columns');
    await dialogOf(page).getByRole('button', { name: 'Add column' }).click();
    await dialogOf(page).getByRole('textbox', { name: 'Name of column 3' }).fill('extra');
    await dialogOf(page).getByRole('button', { name: 'Apply' }).click();
    await list(page).getByRole('link', { name: /Attendance codes/ }).click();
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(grid(page, 'Small draft').getByRole('columnheader')).toHaveText(['code', 'limit', 'extra', '']);
  });
});

test.describe('the toolbar of a table is short: the main action, and a More menu', () => {
  const draft = (s: ReturnType<typeof seedSnapshot>) => {
    s.refTables.push({ id: 'ref-d', name: 'Tool draft', description: 'd', versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'draft', columns: [{ name: 'k', type: 'text' }], rows: [['a']] }] });
  };
  const toolbar = (page: Page) => page.locator('section[aria-label="Table details"]').getByRole('button');

  test('a draft shows Save changes, Publish and More; the rest is in the menu', async ({ page }) => {
    await seed(page, draft);
    await page.goto(`${URL}?table=ref-d&v=1`);
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
    const names = await toolbar(page).evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim()).filter((n) => !/^(Remove row|Add row|v\d)/.test(n)));
    expect(names).toEqual(['Save changes', 'Publish', 'More actions for this table']);
    await page.getByRole('button', { name: /^More actions for this table/ }).click();
    await expect(page.getByRole('option')).toHaveText(['Edit description', 'Columns', 'Paste from Excel', 'New version', 'Delete table']);
  });

  test('a published version shows New version and More, and More holds Edit description and Delete table', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByRole('button', { name: 'New version', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^More actions for this table/ }).click();
    await expect(page.getByRole('option')).toHaveText(['Edit description', 'Delete table']);
  });

  test('the menu opens New version for a draft too', async ({ page }) => {
    await seed(page, draft);
    await page.goto(`${URL}?table=ref-d&v=1`);
    await fromMenu(page, 'New version');
    await expect(page.getByRole('dialog', { name: /^New version from v1/ })).toBeVisible();
  });

  test('the toolbar stays on one line next to the name at 1440 px', async ({ page }) => {
    await seed(page, draft);
    await page.goto(`${URL}?table=ref-d&v=1`);
    const name = await page.locator('section[aria-label="Table details"] h2').boundingBox();
    const more = await page.getByRole('button', { name: /^More actions for this table/ }).boundingBox();
    expect(Math.abs((name!.y + name!.height / 2) - (more!.y + more!.height / 2))).toBeLessThan(40);
  });
});

test('the admin deletes a table that no flow reads, after a confirmation that names it', async ({ page }) => {
  await page.goto(`${URL}?table=ref-ot-types`);
  await expect(page.getByText('No flow reads this table yet.')).toBeVisible();
  await fromMenu(page, 'Delete table');
  const dialog = page.getByRole('dialog', { name: 'Delete OT types?' });
  await expect(dialog).toContainText('removes the table with all of its versions and rows for good');
  // Cancel and Escape leave the table where it is.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(list(page).getByRole('link', { name: /OT types/ })).toBeVisible();
  await fromMenu(page, 'Delete table');
  await dialog.getByRole('button', { name: 'Delete table' }).click();
  await expect(toastWith(page, 'Deleted OT types.')).toBeVisible();
  await expect(list(page).getByRole('link')).toHaveCount(2);
  await expect(list(page).getByRole('link', { name: /OT types/ })).toHaveCount(0);
  // It is gone for good: after a reload too.
  await page.reload();
  await expect(list(page).getByRole('link')).toHaveCount(2);
});

test('a table that a flow reads is not deleted: the dialog names the flow and the table stays', async ({ page }) => {
  await seedRunnableFlow(page);
  await page.goto(`${URL}?table=ref-ot-limits`);
  await fromMenu(page, 'Delete table');
  const dialog = page.getByRole('dialog', { name: 'Delete OT limits?' });
  await dialog.getByRole('button', { name: 'Delete table' }).click();
  await expect(dialog.getByRole('alert')).toContainText('The reference table "OT limits" is read by Run test flow. Remove it from those flows first, then delete it.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(list(page).getByRole('link', { name: /OT limits/ })).toBeVisible();
});

test('a user who is not the admin has no way to delete a table', async ({ page }) => {
  await seedRunnableFlow(page);
  await seed(page, (s) => (s.currentUserId = 'user-lan'));
  await page.goto(URL);
  await expect(page.getByRole('button', { name: /^More actions for this table/ })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'Delete table' })).toHaveCount(0);
});
