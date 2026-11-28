import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

// T9.14: the notice of a linked table (SPEC 16.2 items 3 and 4): a version of A with a new value is published, B gets a draft, the admin
// sees the notice and the dot, fills the columns, publishes, and both go.
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
const chip = (page: Page, text: string | RegExp) => page.getByRole('group', { name: 'Versions' }).getByRole('button', { name: text });
const dot = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('img', { name: /need(s)? attention/ });

/** Departments: v1 published (Kho, QA) and a draft v2 from 1 Dec 2026 (Kho, Vận chuyển: QA leaves, a value is new). Costs: published, empty. */
async function seed(page: Page, userId = 'user-harold') {
  const s = { ...seedSnapshot(), currentUserId: userId };
  const text = (name: string) => ({ name, type: 'text' as const });
  s.refTables.push(
    { id: 'ref-dept', name: 'Departments', description: '', versions: [
      { versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', columns: [text('dept')], rows: [['Kho'], ['QA']] },
      { versionNo: 2, validFrom: '2026-12-01', validTo: null, status: 'draft', columns: [text('dept')], rows: [['Kho'], ['Vận chuyển']] },
    ] },
    { id: 'ref-costs', name: 'Costs', description: '', versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', columns: [text('dept'), { name: 'limit', type: 'number' as const }], rows: [] }] },
  );
  await page.addInitScript((j) => localStorage.setItem('dfw.seed', j), JSON.stringify(s));
}

async function linkCosts(page: Page) {
  await open(page, 'Costs');
  await fromMenu(page, 'Link to a table');
  const dialog = page.getByRole('dialog', { name: 'Link Costs to a table' });
  await dialog.getByRole('button', { name: /^Take the values from the table/ }).click();
  await page.getByRole('option', { name: 'Departments', exact: true }).click();
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.getByText('Values from Departments · dept', { exact: true })).toBeVisible();
}

test('the whole journey: link, publish the first values, publish a version of A with a new value, the notice and the dot, fill, publish, both go', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto('/reference-tables');
  await linkCosts(page);

  // The link made a draft v2 of Costs with the two values, and a notice and a dot. The rows are marked New.
  await expect(dot(page)).toHaveAccessibleName('1 table needs attention');
  await expect(page.getByText('2 new values from Departments · dept need their other columns: Kho, QA.')).toBeVisible();
  await page.getByRole('button', { name: 'Open the draft' }).click();
  const rows = page.getByRole('table', { name: 'Rows of Costs' }).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('New');
  // Publishing rows whose other columns are empty shows a quiet warning in the dialog and does not block it.
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const publish = page.getByRole('dialog', { name: 'Publish v2?' });
  await expect(publish).toContainText('2 new rows have empty columns');
  await expect(publish.getByRole('button', { name: 'Publish' })).toBeEnabled();
  await publish.getByRole('button', { name: 'Cancel' }).click();
  // Fill the limits, save and publish: the notice and the dot go.
  await page.getByRole('textbox', { name: 'Row 1, limit' }).fill('10');
  await page.getByRole('textbox', { name: 'Row 2, limit' }).fill('20');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(toastWith(page, 'Changes saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Publish v2?' });
  await expect(confirm).not.toContainText('empty columns');
  await confirm.getByRole('button', { name: 'Publish' }).click();
  await expect(toastWith(page, 'v2 published.')).toBeVisible();
  await expect(dot(page)).toHaveCount(0);
  await expect(page.getByText(/need their other columns/)).toHaveCount(0);

  // A version of A with a new value (and without QA) is published: Costs gets a draft from 1 Dec 2026.
  await open(page, 'Departments');
  await chip(page, /^v2/).click();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('dialog', { name: 'Publish v2?' }).getByRole('button', { name: 'Publish' }).click();
  await expect(toastWith(page, 'v2 published.')).toBeVisible();
  await expect(dot(page)).toHaveAccessibleName('1 table needs attention');
  await open(page, 'Costs');
  await expect(page.getByText('1 new value from Departments · dept needs its other columns: Vận chuyển.')).toBeVisible();
  await page.getByRole('button', { name: 'Open the draft' }).click();
  await expect(chip(page, /^v3/)).toHaveAttribute('aria-pressed', 'true');
  const draft = page.getByRole('table', { name: 'Rows of Costs' }).locator('tbody tr');
  // Kho and QA keep their limits; QA is not in Departments any more; Vận chuyển is new.
  await expect(draft).toHaveCount(3);
  await expect(draft.filter({ hasText: 'Not in Departments any more' })).toHaveCount(1);
  await expect(draft.filter({ hasText: 'New' })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Row 1, limit' })).toHaveValue('10');
  await page.getByRole('textbox', { name: 'Row 3, limit' }).fill('30');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(toastWith(page, 'Changes saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('dialog', { name: 'Publish v3?' }).getByRole('button', { name: 'Publish' }).click();
  await expect(toastWith(page, 'v3 published.')).toBeVisible();
  await expect(dot(page)).toHaveCount(0);
});

test('a user who is not an admin sees no dot and no notice', async ({ page }) => {
  await seed(page, 'user-lan');
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem('dfw.seed')!);
    s.refTables.find((t: { id: string }) => t.id === 'ref-costs').link = { tableId: 'ref-dept', column: 'dept', keyColumn: 'dept' };
    s.refLinkNotices = [{ id: 'n1', tableId: 'ref-costs', sourceTableId: 'ref-dept', column: 'dept', draftVersionNo: 2, values: ['Kho'], createdAt: '2026-11-17T00:00:00Z', closedAt: null }];
    s.flows.push({ id: 'flow-lan-costs', name: 'Lan costs', ownerId: 'user-lan', scope: 'personal', deletedAt: null, groupIds: [], versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', changeNote: '', definition: { schemaVersion: 1, nodes: [{ id: 'R', type: 'reference_table', label: 'R', position: { x: 0, y: 0 }, settings: { table: 'Costs' } }], edges: [] } }] });
    localStorage.setItem('dfw.seed', JSON.stringify(s));
  });
  await page.goto('/reference-tables');
  await expect(page.getByRole('heading', { name: 'Costs', level: 2 })).toBeVisible();
  await expect(dot(page)).toHaveCount(0);
  await expect(page.getByText(/need their other columns/)).toHaveCount(0);
});
