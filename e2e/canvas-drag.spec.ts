import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';
import { percentile } from '../scripts/lib/canvas-perf';

// SPEC 13.1: dragging a card is smooth, no card disappears, one drag is one change. Budgets of the spec are p95 33 ms (12
// steps) and 50 ms (60 steps); the test keeps a margin of 20% under them (T6.2).
const MOVES = 60;
const BUDGET = { 12: 33 * 0.8, 60: 50 * 0.8 } as const;

function generated(steps: number) {
  const nodes = Array.from({ length: steps }, (_, i) => ({
    id: `s${i + 1}`,
    type: i === 0 ? 'input_file' : i === steps - 1 ? 'output' : 'column_mapping',
    label: `Step ${i + 1}`,
    position: { x: (i % 6) * 280, y: Math.floor(i / 6) * 120 },
    settings: {},
  }));
  return { schemaVersion: 1, nodes, edges: nodes.slice(1).map((n, i) => ({ source: nodes[i]!.id, target: n.id })) };
}

async function open(page: Page, steps: number, status: 'draft' | 'published' = 'draft') {
  const s = seedSnapshot();
  s.flows.push({ id: 'flow-drag', name: 'Drag test', ownerId: 'user-harold', scope: 'personal', deletedAt: null, groupIds: [], versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status, changeNote: '', definition: generated(steps) }] });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
  await page.goto('/flows/flow-drag/versions/1');
  await expect(page.locator('.react-flow__node')).toHaveCount(steps);
  await page.waitForTimeout(800);
}

const renders = (page: Page) => page.evaluate(() => ({ ...((window as unknown as { __dfwRenders?: Record<string, number> }).__dfwRenders ?? {}) }));
const visible = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('.react-flow__node')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }).length);
const edgePath = (page: Page) => page.locator('.react-flow__edge-path').nth(1).getAttribute('d');
const centre = async (page: Page, name: string) => {
  const b = await page.locator('.react-flow__node').filter({ hasText: name }).first().boundingBox();
  return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 };
};

/** Drags the card named `name` by (dx, dy) in MOVES moves; returns what was seen while the card was held. */
async function drag(page: Page, name: string, dx: number, dy: number) {
  const from = await centre(page, name);
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __run: boolean };
    w.__frames = [];
    w.__run = true;
    const tick = (t: number): void => {
      if (!w.__run) return;
      w.__frames.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const before = await renders(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  let minVisible = Infinity;
  let pathDuring: string | null = null;
  for (let i = 1; i <= MOVES; i++) {
    await page.mouse.move(from.x + (dx * i) / MOVES, from.y + (dy * i) / MOVES);
    if (i % 6 === 0) minVisible = Math.min(minVisible, await visible(page));
    if (i === MOVES / 2) pathDuring = await edgePath(page);
  }
  await page.mouse.up();
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __run: boolean };
    w.__run = false;
    return w.__frames;
  });
  await page.waitForTimeout(300);
  const after = await renders(page);
  const gaps = frames.slice(1).map((t, i) => t - frames[i]!);
  const added = (k: string) => (after[k] ?? 0) - (before[k] ?? 0);
  return { from, minVisible, pathDuring, p95: percentile(gaps, 95), added };
}

for (const steps of [12, 60] as const) {
  test(`dragging one card of ${steps} steps: nothing disappears, edges follow, one change, inside the frame budget`, async ({ page }) => {
    await open(page, steps);
    await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toHaveCount(0);
    const target = 'Step 3';
    const edgeBefore = await edgePath(page);
    const startPos = await centre(page, target);
    const r = await drag(page, target, 160, 90);

    // 1. Every card stays visible while it is dragged and after the drop, at the position where it was left.
    expect(r.minVisible).toBe(steps);
    expect(await visible(page)).toBe(steps);
    const end = await centre(page, target);
    expect(Math.abs(end.x - (startPos.x + 160))).toBeLessThan(3);
    expect(Math.abs(end.y - (startPos.y + 90))).toBeLessThan(3);
    // 4. The edges follow the card and the selection is kept.
    expect(r.pathDuring).not.toBe(edgeBefore);
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
    await expect(page.locator('.react-flow__node.selected')).toContainText(target);
    await expect(page.getByRole('heading', { name: /Step 3/ })).toBeVisible();
    // 3. One drag is one change: the unsaved state is on, and the parts around the canvas render only for the
    // selection and the drop, not for every move.
    await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toHaveCount(1);
    expect(r.added('BuilderScreen')).toBeLessThanOrEqual(4);
    expect(r.added('SettingsPanel')).toBeLessThanOrEqual(4);
    expect(r.added('StepList')).toBeLessThanOrEqual(4);
    // Only the held card renders for each move; the other cards render for the selection and the drop.
    expect(r.added('StepCard')).toBeLessThanOrEqual(MOVES + 4 * steps);
    // 2. Smooth.
    expect(r.p95).toBeLessThanOrEqual(BUDGET[steps]);
  });
}

test('a published (read-only) version cannot be dragged', async ({ page }) => {
  await open(page, 12, 'published');
  // A drag on a locked card pans the canvas, so the card is compared with its neighbour, not with the page.
  const gap = async () => {
    const [a, b] = [await centre(page, 'Step 3'), await centre(page, 'Step 4')];
    return { x: Math.round(b.x - a.x), y: Math.round(b.y - a.y) };
  };
  const before = await gap();
  await drag(page, 'Step 3', 160, 90);
  expect(await gap()).toEqual(before);
  expect(await visible(page)).toBe(12);
  await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toHaveCount(0);
});
