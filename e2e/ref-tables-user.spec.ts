import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

// What a user sees of the reference tables (SPEC 12.1): the tables that a flow of theirs reads, read-only, with "Used by";
// the names of every table in the steps; the rows of a table of a shared flow for a member of its group.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T09:00:00+07:00'));
});

const node = (id: string, type: string, settings: Record<string, unknown>, y: number) => ({ id, type, label: id, position: { x: 0, y }, settings });
const lookup = (table: string) => ({ schemaVersion: 1, nodes: [node('People', 'input_file', { key: 'people', headerRow: 1 }, 0), node('Limits', 'lookup_join', { source: { kind: 'reference', table }, keys: [{ left: 'kind', right: 'period' }], bring: [{ column: 'limit_hours', as: 'limit' }], onNoMatch: 'blank' }, 96), node('Out', 'output', { file: 'Result', format: 'xlsx', sheet: 'People' }, 192)], edges: [{ source: 'People', target: 'Limits', targetHandle: 'left' }, { source: 'Limits', target: 'Out' }] });

/** As the given user: a shared flow of HR Payroll that reads "OT limits", and a personal flow of Lan that reads "OT types". */
const seedAs = async (page: Page, userId: string) => {
  const s = { ...seedSnapshot(), currentUserId: userId };
  const version = (definition: unknown) => [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published' as const, changeNote: '', definition }];
  s.flows.push(
    { id: 'flow-shared-run', name: 'Payroll limits', ownerId: 'user-harold', scope: 'shared', deletedAt: null, groupIds: ['group-payroll'], versions: version(lookup('OT limits')) },
    { id: 'flow-lan', name: 'Lan types', ownerId: 'user-lan', scope: 'personal', deletedAt: null, groupIds: [], versions: version(lookup('OT types')) },
  );
  await page.addInitScript((j) => localStorage.setItem('dfw.seed', j), JSON.stringify(s));
};
const list = (page: Page) => page.getByRole('list', { name: 'Reference tables' });

test('a member of the group sees the tables that their flows read, with Used by, and no button that changes a table', async ({ page }) => {
  await seedAs(page, 'user-lan');
  await page.goto('/reference-tables');
  await expect(page.getByRole('heading', { name: 'Reference tables', level: 1 })).toBeVisible();
  const items = list(page).getByRole('link');
  await expect(items).toHaveCount(2); // OT types (personal flow) and OT limits (shared flow); Attendance codes is read by nothing
  await expect(items.filter({ hasText: 'OT limits' })).toContainText('Used by Payroll limits.');
  await expect(items.filter({ hasText: 'OT types' })).toContainText('Used by Lan types.');
  await expect(items.filter({ hasText: 'Attendance codes' })).toHaveCount(0);
  for (const name of ['Import file', 'New table', 'Columns', 'Edit description', 'Paste from Excel', 'New version', 'Publish']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  // The rows are there, as text, read-only, with the Used by line above the grid.
  await items.filter({ hasText: 'OT limits' }).click();
  await expect(page.getByRole('table', { name: 'Rows of OT limits' }).locator('tbody tr').first()).toBeVisible();
  await expect(page.getByRole('table', { name: 'Rows of OT limits' }).getByRole('textbox')).toHaveCount(0);
  await expect(page.getByText('Only the admin can change reference tables.')).toBeVisible();
  await expect(page.locator('section[aria-label="Table details"]').getByText('Used by Payroll limits.')).toBeVisible();
});

test('a user in the other group sees only the table of their own flow, and an empty state when no flow reads a table', async ({ page }) => {
  await seedAs(page, 'user-minh'); // HR Analytics: the shared flow is not theirs, and Lan's personal flow is Lan's
  await page.goto('/reference-tables');
  await expect(page.getByText('No reference tables yet')).toBeVisible();
  await expect(page.getByText('None of your flows reads a reference table yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New table' })).toHaveCount(0);
});

test('the admin still sees every table, with the flows that use it', async ({ page }) => {
  await seedAs(page, 'user-harold');
  await page.goto('/reference-tables');
  await expect(list(page).getByRole('link')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Import file' })).toBeVisible();
});

test('the Lookup step offers every table by name; a table that the user cannot read yet says to save the flow, and saving makes it readable', async ({ page }) => {
  await seedAs(page, 'user-minh');
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Minh reads limits');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await page.getByRole('button', { name: 'Add step Lookup / Join' }).click();
  const panel = page.getByRole('complementary', { name: 'Step settings' });
  await panel.getByRole('tab', { name: 'Configure' }).click();
  await panel.getByRole('button', { name: /^Look up in/ }).click();
  for (const name of ['Attendance codes', 'OT types', 'OT limits']) await expect(page.getByRole('option', { name: `Reference table: ${name}` })).toBeVisible();
  await page.getByRole('option', { name: 'Reference table: OT limits' }).click();
  await expect(panel.getByText('Save the flow to read this table.')).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(panel.getByText('Save the flow to read this table.')).toHaveCount(0);
});

test('a member of the group runs a shared flow: the run resolves the table of the flow', async ({ page }) => {
  await seedAs(page, 'user-lan');
  await page.goto('/flows/flow-shared-run/run');
  await expect(page.getByRole('heading', { name: 'Run flow', level: 1 })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Versions used for this date' })).toContainText('OT limits v1');
  await page.locator('input[type=file]').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from('name,kind\nAnn,WEEK\nBob,MONTH\n') });
  await page.getByRole('button', { name: /^Run flow$/ }).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  const table = page.getByRole('table', { name: 'Preview of People' });
  await expect(table.getByRole('columnheader')).toHaveText(['name', 'kind', 'limit']);
  await expect(table.locator('tbody tr').nth(0)).toContainText('16');
});
