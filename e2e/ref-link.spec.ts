import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

// T9.13: the link of a reference table to a column of another table (SPEC 16.2 item 1, DESIGN "Linked reference tables").
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T09:00:00+07:00'));
});

const toastWith = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const fromMenu = async (page: Page, item: string) => {
  await page.getByRole('button', { name: /^More actions for this table/ }).click();
  await page.getByRole('option', { name: item, exact: true }).click();
};
const list = (page: Page) => page.getByRole('list', { name: 'Reference tables' });
const open = async (page: Page, name: string) => {
  await list(page).getByRole('link').filter({ hasText: name }).click();
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
};

/** Departments (4 values, 2 distinct after the trim and the blank) and Costs (no rows), both published, and a user's own flow that reads Costs. */
async function seed(page: Page, userId = 'user-harold') {
  const s = { ...seedSnapshot(), currentUserId: userId };
  const text = (name: string) => ({ name, type: 'text' as const });
  s.refTables.push(
    { id: 'ref-dept', name: 'Departments', description: '', versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', columns: [text('dept'), text('note')], rows: [['Kho', 'a'], [' QA ', 'b'], ['Kho', 'c'], ['', 'd']] }] },
    { id: 'ref-costs', name: 'Costs', description: '', versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', columns: [text('dept'), { name: 'limit', type: 'number' as const }], rows: [] }] },
  );
  await page.addInitScript((j) => localStorage.setItem('dfw.seed', j), JSON.stringify(s));
}

test('the menu of an admin has "Link to a table"; the dialog lists the other tables, a column and the key column, and says how many rows the link adds', async ({ page }) => {
  await seed(page);
  await page.goto('/reference-tables');
  await open(page, 'Costs');
  await fromMenu(page, 'Link to a table');
  const dialog = page.getByRole('dialog', { name: 'Link Costs to a table' });
  await expect(dialog).toBeVisible();
  // Link is disabled until a table is chosen.
  await expect(dialog.getByRole('button', { name: 'Link', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: /^Take the values from the table/ }).click();
  await expect(page.getByRole('option', { name: 'Costs', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'Departments', exact: true }).click();
  await expect(dialog.getByRole('button', { name: /^Column of that table/ })).toContainText('dept');
  await expect(dialog.getByRole('textbox', { name: 'Key column of this table' })).toHaveValue('dept');
  await expect(dialog).toContainText('2 distinct values will be added as rows.');
  await dialog.getByRole('button', { name: /^Column of that table/ }).click();
  await page.getByRole('option', { name: 'note', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Key column of this table' })).toHaveValue('note');
  await expect(dialog).toContainText('4 distinct values will be added as rows.');
});

test('Link makes a draft with the values, shows the line "Values from Departments · dept", and the menu offers "Unlink" instead', async ({ page }) => {
  await seed(page);
  await page.goto('/reference-tables');
  await open(page, 'Costs');
  await fromMenu(page, 'Link to a table');
  const dialog = page.getByRole('dialog', { name: 'Link Costs to a table' });
  await dialog.getByRole('button', { name: /^Take the values from the table/ }).click();
  await page.getByRole('option', { name: 'Departments', exact: true }).click();
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(toastWith(page, 'Costs is linked.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Values from Departments · dept')).toBeVisible();
  // The draft v2 holds the values: open it from the version chips.
  await page.getByRole('group', { name: 'Versions' }).getByRole('button', { name: /^v2/ }).click();
  const rows = page.getByRole('table', { name: 'Rows of Costs' }).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: /^More actions for this table/ }).click();
  await expect(page.getByRole('option', { name: 'Unlink', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Link to a table', exact: true })).toHaveCount(0);
});

test('a table that would make a cycle is not in the list, and the dialog says why', async ({ page }) => {
  await seed(page);
  await page.goto('/reference-tables');
  await open(page, 'Costs');
  await fromMenu(page, 'Link to a table');
  const dialog = page.getByRole('dialog', { name: 'Link Costs to a table' });
  await dialog.getByRole('button', { name: /^Take the values from the table/ }).click();
  await page.getByRole('option', { name: 'Departments', exact: true }).click();
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.getByText('Values from Departments · dept')).toBeVisible();
  await open(page, 'Departments');
  await fromMenu(page, 'Link to a table');
  const again = page.getByRole('dialog', { name: 'Link Departments to a table' });
  await expect(again).toContainText('Costs');
  await expect(again).toContainText('would make a cycle');
  await again.getByRole('button', { name: /^Take the values from the table/ }).click();
  await expect(page.getByRole('option', { name: 'Costs', exact: true })).toHaveCount(0);
});

test('Unlink keeps the rows, removes the line and offers "Link to a table" again', async ({ page }) => {
  await seed(page);
  await page.goto('/reference-tables');
  await open(page, 'Costs');
  await fromMenu(page, 'Link to a table');
  const dialog = page.getByRole('dialog', { name: 'Link Costs to a table' });
  await dialog.getByRole('button', { name: /^Take the values from the table/ }).click();
  await page.getByRole('option', { name: 'Departments', exact: true }).click();
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.getByText('Values from Departments · dept')).toBeVisible();
  await fromMenu(page, 'Unlink');
  await expect(toastWith(page, 'Costs is not linked any more. It keeps its rows.')).toBeVisible();
  await expect(page.getByText('Values from Departments · dept')).toHaveCount(0);
  await page.getByRole('group', { name: 'Versions' }).getByRole('button', { name: /^v2/ }).click();
  await expect(page.getByRole('table', { name: 'Rows of Costs' }).locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: /^More actions for this table/ }).click();
  await expect(page.getByRole('option', { name: 'Link to a table', exact: true })).toBeVisible();
});

test('the New table dialog has a switch that replaces the paste box with the same three controls', async ({ page }) => {
  await seed(page);
  await page.goto('/reference-tables');
  await page.getByRole('button', { name: 'New table' }).click();
  const dialog = page.getByRole('dialog', { name: 'New reference table' });
  await expect(dialog.getByRole('textbox', { name: /^Header row and rows from Excel/ })).toBeVisible();
  await dialog.getByRole('switch', { name: 'Take the values from a column of another table' }).click();
  await expect(dialog.getByRole('textbox', { name: /^Header row and rows from Excel/ })).toHaveCount(0);
  await dialog.getByRole('textbox', { name: 'Table name' }).fill('Teams');
  // Create is refused until the link is filled.
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toContainText('Choose the table, its column and the name of the key column');
  await dialog.getByRole('button', { name: /^Take the values from the table/ }).click();
  await page.getByRole('option', { name: 'Departments', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Key column of this table' }).fill('team');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Teams', level: 2 })).toBeVisible();
  await expect(page.getByText('Values from Departments · dept')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Rows of Teams' }).locator('tbody tr')).toHaveCount(2);
});

test('a user who is not an admin sees no link control and no line, even for a table that is linked', async ({ page }) => {
  await seed(page, 'user-lan');
  // Lan reads Costs through a flow of their own; Costs is linked to Departments in the store.
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem('dfw.seed')!);
    s.refTables.find((t: { id: string }) => t.id === 'ref-costs').link = { tableId: 'ref-dept', column: 'dept', keyColumn: 'dept' };
    s.flows.push({ id: 'flow-lan-costs', name: 'Lan costs', ownerId: 'user-lan', scope: 'personal', deletedAt: null, groupIds: [], versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', changeNote: '', definition: { schemaVersion: 1, nodes: [{ id: 'R', type: 'reference_table', label: 'R', position: { x: 0, y: 0 }, settings: { table: 'Costs' } }], edges: [] } }] });
    localStorage.setItem('dfw.seed', JSON.stringify(s));
  });
  await page.goto('/reference-tables');
  await expect(page.getByRole('heading', { name: 'Costs', level: 2 })).toBeVisible();
  await expect(page.getByText(/^Values from/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^More actions for this table/ })).toHaveCount(0);
});
