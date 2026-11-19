import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedRunnableFlow } from './runnable-flow';
import { seedSnapshot } from '../src/store/seed';

const URL = '/reference-tables';
const grid = (page: Page, name: string) => page.getByRole('table', { name: `Rows of ${name}` });
const gridRows = (page: Page, name: string) => grid(page, name).locator('tbody tr');
const toastWith = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
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
  expect(Math.round((await gridRows(page, 'OT types').first().boundingBox())!.height)).toBe(57);
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
  await page.getByRole('button', { name: 'Paste from Excel' }).click();
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

test('a user who is not the admin can read every table but cannot create or change one', async ({ page }) => {
  await seed(page, (s) => (s.currentUserId = 'user-lan'));
  await page.goto(URL);
  await expect(list(page).getByRole('link')).toHaveCount(3);
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
