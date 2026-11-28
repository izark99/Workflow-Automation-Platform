import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedRunnableFlow } from './runnable-flow';
import { seedSnapshot } from '../src/store/seed';

// T9.15: the edges of linked reference tables on the screens (the same rules are tested on LocalStore in `src/store/ref-link.test.ts`,
// on the database path in `integration/supabase-store.test.ts` and in `supabase/tests/database/210-ref-links.test.sql`).
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
const chip = (page: Page, text: RegExp) => page.getByRole('group', { name: 'Versions' }).getByRole('button', { name: text });
const dot = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('img', { name: /need(s)? attention/ });
const text = (name: string) => ({ name, type: 'text' as const });

async function link(page: Page, target: string, source: string) {
  await open(page, target);
  await fromMenu(page, 'Link to a table');
  const dialog = page.getByRole('dialog', { name: `Link ${target} to a table` });
  await dialog.getByRole('button', { name: /^Take the values from the table/ }).click();
  await page.getByRole('option', { name: source, exact: true }).click();
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(toastWith(page, `${target} is linked.`)).toBeVisible();
}
async function publishDraft(page: Page, no: number) {
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('dialog', { name: `Publish v${no}?` }).getByRole('button', { name: 'Publish' }).click();
  await expect(toastWith(page, `v${no} published.`)).toBeVisible();
}

test('a Lookup that reads a linked table runs as before, on the version that the admin published', async ({ page }) => {
  test.setTimeout(120_000);
  await seedRunnableFlow(page);
  // The seed of the runnable flow is in storage already; add the source table to it before the page loads.
  await page.addInitScript(() => {
    const seed = JSON.parse(localStorage.getItem('dfw.seed')!);
    seed.refTables.push({ id: 'ref-periods', name: 'Periods', description: '', versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', columns: [{ name: 'p', type: 'text' }], rows: [['WEEK'], ['DAY'], ['QUARTER']] }] });
    localStorage.setItem('dfw.seed', JSON.stringify(seed));
  });
  await page.goto('/reference-tables');
  await link(page, 'OT limits', 'Periods');
  // The draft keeps the rows of v1 and adds the value that OT limits did not hold; the admin publishes it.
  await open(page, 'OT limits');
  await page.getByRole('button', { name: 'Open the draft' }).click();
  await publishDraft(page, 2);
  await expect(dot(page)).toHaveCount(0);
  // The flow reads the table by its name and runs on the new version.
  await page.goto('/flows/flow-run/run');
  await page.locator('input[aria-label="Choose file: people"]').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from('name,kind\nAnn,WEEK\n') });
  await page.getByRole('button', { name: 'Run flow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('table', { name: 'Preview of People' }).locator('tbody tr').first().locator('td').nth(2)).toHaveText('16');
});

test('a chain A to B to C: one publish of A gives both drafts the new value and opens two notices', async ({ page }) => {
  test.setTimeout(120_000);
  const s = seedSnapshot();
  s.refTables.push(
    { id: 'ref-a', name: 'Alpha', description: '', versions: [
      { versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', columns: [text('k')], rows: [['x']] },
      { versionNo: 2, validFrom: '2026-12-01', validTo: null, status: 'draft', columns: [text('k')], rows: [['x'], ['y']] },
    ] },
    { id: 'ref-b', name: 'Beta', description: '', versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', columns: [text('k')], rows: [] }] },
    { id: 'ref-c', name: 'Gamma', description: '', versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', columns: [text('k')], rows: [] }] },
  );
  await page.addInitScript((j) => localStorage.setItem('dfw.seed', j), JSON.stringify(s));
  await page.goto('/reference-tables');
  await link(page, 'Beta', 'Alpha');
  await open(page, 'Beta');
  await page.getByRole('button', { name: 'Open the draft' }).click();
  await publishDraft(page, 2);
  await link(page, 'Gamma', 'Beta');
  await open(page, 'Gamma');
  await page.getByRole('button', { name: 'Open the draft' }).click();
  await publishDraft(page, 2);
  await expect(dot(page)).toHaveCount(0);

  await open(page, 'Alpha');
  await chip(page, /^v2/).click();
  await publishDraft(page, 2);
  await expect(dot(page)).toHaveAccessibleName('2 tables need attention');
  await open(page, 'Beta');
  await expect(page.getByText('1 new value from Alpha · k needs its other columns: y.')).toBeVisible();
  await open(page, 'Gamma');
  await expect(page.getByText('1 new value from Beta · k needs its other columns: y.')).toBeVisible();
});

test('publishing A without the linked column and deleting A while a table is linked are refused, with the names of the tables', async ({ page }) => {
  test.setTimeout(120_000);
  const s = seedSnapshot();
  s.refTables.push(
    { id: 'ref-a', name: 'Alpha', description: '', versions: [
      { versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', columns: [text('k'), text('note')], rows: [['x', 'a']] },
      { versionNo: 2, validFrom: '2026-12-01', validTo: null, status: 'draft', columns: [text('k'), text('note')], rows: [['x', 'a']] },
    ] },
    { id: 'ref-b', name: 'Beta', description: '', versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', columns: [text('k')], rows: [] }] },
  );
  await page.addInitScript((j) => localStorage.setItem('dfw.seed', j), JSON.stringify(s));
  await page.goto('/reference-tables');
  await link(page, 'Beta', 'Alpha');

  // The admin removes the column k from the draft v2 of Alpha and tries to publish it.
  await open(page, 'Alpha');
  await chip(page, /^v2/).click();
  await fromMenu(page, 'Columns');
  const cols = page.getByRole('dialog', { name: 'Columns of the draft' });
  await cols.getByRole('button', { name: 'Remove column 1' }).click();
  await cols.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(toastWith(page, 'Changes saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const publish = page.getByRole('dialog', { name: 'Publish v2?' });
  await publish.getByRole('button', { name: 'Publish' }).click();
  await expect(publish.getByRole('alert')).toContainText('This version of "Alpha" has no column "k", which Beta take their values from.');
  await publish.getByRole('button', { name: 'Cancel' }).click();

  // Deleting Alpha is refused while Beta is linked to it.
  await fromMenu(page, 'Delete table');
  const del = page.getByRole('dialog', { name: 'Delete Alpha?' });
  await del.getByRole('button', { name: 'Delete table' }).click();
  await expect(del.getByRole('alert')).toContainText('The table "Alpha" gives its values to Beta. Unlink those tables first, then delete it.');
});
