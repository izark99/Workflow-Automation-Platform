import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

// T8.4: adding after the selected step and dropping a step on an edge (SPEC 15.2 items 1 and 2).
const cards = (page: Page) => page.locator('.react-flow__node');
async function newFlow(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Add after test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await expect(cards(page)).toHaveCount(0);
}
const add = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` });
const live = (page: Page) => page.locator('[role=status][aria-live=polite]').filter({ hasText: /Added/ });

test('a flow of five steps is built by buttons only: each step goes to the right and is connected', async ({ page }) => {
  await newFlow(page);
  for (const name of ['Input file', 'Column mapping', 'Filter', 'Formula column', 'Output']) await add(page, name).click();
  await expect(cards(page)).toHaveCount(5);
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  const xs = await cards(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
  expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  // The Filter is connected through match.
  await expect(page.locator('.react-flow__edge[data-id*="filter"]').first()).toBeVisible();
  await expect(live(page)).toContainText('connected to');
});

test('the same flow is built by keyboard only', async ({ page }) => {
  await newFlow(page);
  for (const name of ['Input file', 'Column mapping', 'Output']) {
    await add(page, name).focus();
    await page.keyboard.press('Enter');
  }
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
});

test('an Input file after a selected step is added without a connection, and with nothing selected the step goes below', async ({ page }) => {
  await newFlow(page);
  await add(page, 'Input file').click();
  await add(page, 'Input file').click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(live(page)).not.toContainText('connected');
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await add(page, 'Column mapping').click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
});

test('a step dropped on an edge splits it, shows the edge in primary and the pill while over it', async ({ page }) => {
  const s = seedSnapshot();
  s.flows.push({
    id: 'flow-edge', name: 'Edge test', ownerId: 'user-harold', scope: 'personal', deletedAt: null, groupIds: [],
    versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'draft', changeNote: '', definition: {
      schemaVersion: 1,
      nodes: [
        { id: 'a', type: 'input_file', label: 'Alpha', position: { x: 0, y: 100 }, settings: {} },
        { id: 'b', type: 'output', label: 'Omega', position: { x: 700, y: 100 }, settings: {} },
      ],
      edges: [{ source: 'a', target: 'b' }],
    } }],
  });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
  await page.goto('/flows/flow-edge/versions/1');
  await expect(cards(page)).toHaveCount(2);
  const mid = await page.locator('.react-flow__edge-path').first().evaluate((p) => {
    const path = p as SVGPathElement;
    const pt = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM()!;
    return { x: m.a * pt.x + m.e, y: m.d * pt.y + m.f };
  });
  const from = (await add(page, 'Column mapping').boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y + 60, { steps: 5 });
  await page.mouse.move(mid.x, mid.y, { steps: 5 });
  await expect(page.getByText('Insert here')).toBeVisible();
  await expect(page.locator('.react-flow__edge').first()).toHaveClass(/dropTarget/);
  await page.mouse.up();
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(page.getByText('Insert here')).toHaveCount(0);
});

test('a step that cannot be put on an edge shows no pill and is added without touching the edge', async ({ page }) => {
  const s = seedSnapshot();
  s.flows.push({
    id: 'flow-edge2', name: 'Edge test 2', ownerId: 'user-harold', scope: 'personal', deletedAt: null, groupIds: [],
    versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'draft', changeNote: '', definition: {
      schemaVersion: 1,
      nodes: [
        { id: 'a', type: 'input_file', label: 'Alpha', position: { x: 0, y: 100 }, settings: {} },
        { id: 'b', type: 'output', label: 'Omega', position: { x: 700, y: 100 }, settings: {} },
      ],
      edges: [{ source: 'a', target: 'b' }],
    } }],
  });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
  await page.goto('/flows/flow-edge2/versions/1');
  const mid = await page.locator('.react-flow__edge-path').first().evaluate((p) => {
    const path = p as SVGPathElement;
    const pt = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM()!;
    return { x: m.a * pt.x + m.e, y: m.d * pt.y + m.f };
  });
  const from = (await add(page, 'Append').boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y + 60, { steps: 5 });
  await page.mouse.move(mid.x, mid.y, { steps: 5 });
  await expect(page.getByText('Insert here')).toHaveCount(0);
  await page.mouse.up();
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});
