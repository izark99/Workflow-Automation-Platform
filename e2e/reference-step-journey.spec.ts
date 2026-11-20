import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { REF_FLOW, seedReferenceStep } from './reference-step-flow';

const settings = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const card = (page: Page, title: string) => page.locator('.react-flow__node').filter({ has: page.getByText(title, { exact: true }) });
const csv = (text: string, name = 'people.csv') => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
const DATA = 'name,kind\nAnn,WEEK\nBob,MONTH\nCy,YEAR\n';

const node = (id: string, type: string, label: string, x: number, y: number, s: Record<string, unknown>) => ({ id, type, label, position: { x, y }, settings: s });
const lookup = node('look', 'lookup_join', 'Limits', 0, 160, { source: { kind: 'node' }, keys: [{ left: 'kind', right: 'period' }], bring: [{ column: 'limit_hours', as: 'limit' }], onNoMatch: 'blank' });
const people = node('in', 'input_file', 'People', 0, 0, { key: 'people', headerRow: 1 });

/** Drags a connection from the output handle of one card to a target handle of another, as a user does. */
async function connect(page: Page, from: string, to: string, toIndex: number) {
  const a = await card(page, from).locator('.react-flow__handle.source').first().boundingBox();
  const b = await card(page, to).locator('.react-flow__handle.target').nth(toIndex).boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function dragReferenceStepIn(page: Page, y: number) {
  const pane = page.locator('.react-flow__pane');
  const box = (await pane.boundingBox())!;
  await page.getByRole('button', { name: 'Add step Reference table' }).dragTo(pane, { targetPosition: { x: box.width - 260, y } });
}

test('a Reference table step is dragged in, a table is chosen, it previews, and it feeds a Lookup', async ({ page }) => {
  await seedReferenceStep(page, { nodes: [people, lookup] });
  await page.goto(REF_FLOW);
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await connect(page, 'People', 'Limits', 0);
  await dragReferenceStepIn(page, 120);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  // The new step is selected: choose the table on its Configure tab.
  await settings(page).getByRole('tab', { name: 'Configure' }).click();
  await settings(page).getByRole('button', { name: /^Table/ }).click();
  await page.getByRole('option', { name: 'OT limits', exact: true }).click();
  await expect(card(page, 'Reference table')).toContainText('OT limits');
  // Its own preview: the rows of the table, with no test file.
  await settings(page).getByRole('tab', { name: 'Test' }).click();
  await settings(page).getByRole('button', { name: 'Preview first rows' }).click();
  const preview = settings(page).getByRole('table', { name: 'Preview rows' });
  await expect(preview.locator('tbody tr')).toHaveCount(2, { timeout: 30_000 });
  await expect(preview.getByRole('columnheader')).toHaveText(['period', 'limit_hours']);
  // Connect it to the right input of the Lookup and preview the Lookup with a people file.
  await connect(page, 'Reference table', 'Limits', 1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await card(page, 'Limits').click();
  await settings(page).getByRole('tab', { name: 'Test' }).click();
  await settings(page).locator('input[type=file]').setInputFiles(csv(DATA));
  await settings(page).getByRole('button', { name: 'Preview first rows' }).click();
  const rows = settings(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');
  await expect(rows).toHaveCount(3, { timeout: 30_000 });
  await expect(rows.nth(0)).toContainText('16');
  await expect(rows.nth(1)).toContainText('40');
  await expect(rows.nth(2).locator('td').nth(2)).toHaveText('');
});

test('two Reference table steps feed an Append, which previews both', async ({ page }) => {
  const ref = (id: string, label: string, x: number) => node(id, 'reference_table', label, x, 0, { table: 'OT limits' });
  const append = node('app', 'append', 'Stack', 140, 160, { match: 'name' });
  await seedReferenceStep(page, { nodes: [ref('r1', 'Limits A', 0), ref('r2', 'Limits B', 280), append] });
  await page.goto(REF_FLOW);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await connect(page, 'Limits A', 'Stack', 0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await connect(page, 'Limits B', 'Stack', 1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await card(page, 'Stack').click();
  await settings(page).getByRole('tab', { name: 'Test' }).click();
  await settings(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(settings(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr')).toHaveCount(4, { timeout: 30_000 });
});

test('the Lookup form keeps "Reference table: X" for a flow made before the step existed', async ({ page }) => {
  const old = node('look', 'lookup_join', 'Limits', 0, 160, { source: { kind: 'reference', table: 'OT limits' }, keys: [{ left: 'kind', right: 'period' }], bring: [{ column: 'limit_hours', as: 'limit' }], onNoMatch: 'blank' });
  await seedReferenceStep(page, { nodes: [people, old] });
  await page.goto(REF_FLOW);
  await card(page, 'Limits').click();
  await settings(page).getByRole('tab', { name: 'Configure' }).click();
  await expect(settings(page).getByRole('button', { name: /^Look up in/ })).toContainText('Reference table: OT limits');
});

test('a published flow with a Reference table step runs on the Run screen', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T09:00:00+07:00'));
  const ref = node('ref', 'reference_table', 'Table', 280, 0, { table: 'OT limits' });
  const out = node('out', 'output', 'Out', 0, 320, { file: 'Result', format: 'xlsx', sheet: 'People' });
  await seedReferenceStep(page, { status: 'published', nodes: [people, ref, lookup, out] });
  // The seed has no edges for these steps: add them to the saved definition.
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem('dfw.seed')!);
    const f = s.flows.find((x: { id: string }) => x.id === 'flow-refstep');
    f.versions[0].definition.edges = [
      { source: 'in', target: 'look', targetHandle: 'left' },
      { source: 'ref', target: 'look', targetHandle: 'right' },
      { source: 'look', target: 'out' },
    ];
    localStorage.setItem('dfw.seed', JSON.stringify(s));
  });
  await page.goto('/flows/flow-refstep/run');
  await expect(page.getByRole('group', { name: 'Versions used for this date' })).toContainText('OT limits v1');
  await page.locator('input[type=file]').setInputFiles(csv(DATA));
  await page.getByRole('button', { name: /^Run flow$/ }).click();
  await expect(page.getByRole('heading', { name: 'Result: run finished' })).toBeVisible({ timeout: 60_000 });
  const table = page.getByRole('table', { name: 'Preview of People' });
  await expect(table.getByRole('columnheader')).toHaveText(['name', 'kind', 'limit']);
  await expect(table.locator('tbody tr').nth(0)).toContainText('16');
  await expect(table.locator('tbody tr').nth(1)).toContainText('40');
});
