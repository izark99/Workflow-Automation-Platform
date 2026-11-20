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

// T6.3: the other ways to move a card (SPEC 13.1 item 5).
const gapOf = async (page: Page, a: string, b: string) => {
  const [p, q] = [await centre(page, a), await centre(page, b)];
  return { x: q.x - p.x, y: q.y - p.y };
};

async function zoomTo(page: Page, percent: number) {
  const button = page.getByRole('button', { name: percent < 50 ? 'Zoom out' : 'Zoom in' });
  for (let i = 0; i < 20 && !(await page.getByText(`${percent}%`, { exact: true }).count()); i++) {
    await button.click();
    await page.waitForTimeout(200);
  }
  await expect(page.getByText(`${percent}%`, { exact: true })).toBeVisible();
}

test('a card dragged in from the step list lands where it is dropped and nothing flickers', async ({ page }) => {
  await open(page, 12);
  const pane = page.locator('.react-flow__pane');
  const box = (await pane.boundingBox())!;
  const drop = { x: box.width - 200, y: box.height - 120 };
  await page.getByRole('button', { name: 'Add step Group by' }).dragTo(pane, { targetPosition: drop });
  await expect(page.locator('.react-flow__node')).toHaveCount(13);
  // Right after the drop every card, the new one included, is visible at every sample.
  for (let i = 0; i < 10; i++) {
    expect(await visible(page)).toBe(13);
    await page.waitForTimeout(30);
  }
  const c = await centre(page, 'Group by');
  expect(Math.abs(c.x - (box.x + drop.x))).toBeLessThan(3);
  expect(Math.abs(c.y - (box.y + drop.y))).toBeLessThan(3);
  await expect(page.locator('.react-flow__node.selected')).toContainText('Group by');
});

for (const steps of [true, false]) {
  for (const settings of [true, false]) {
    test(`a drag works with the step list ${steps ? 'open' : 'collapsed'} and the settings panel ${settings ? 'open' : 'collapsed'}`, async ({ page }) => {
      await open(page, 12);
      if (!steps) await page.getByRole('button', { name: 'Collapse step list' }).click();
      if (!settings) await page.getByRole('button', { name: 'Collapse settings panel' }).click();
      await expect.poll(async () => (await page.getByRole('complementary', { name: 'Step types' }).boundingBox())?.width).toBe(steps ? 184 : 48);
      await page.waitForTimeout(400);
      const before = await gapOf(page, 'Step 3', 'Step 4');
      const r = await drag(page, 'Step 3', 120, 80);
      expect(r.minVisible).toBe(12);
      expect(await visible(page)).toBe(12);
      const after = await gapOf(page, 'Step 3', 'Step 4');
      // The card moved by the pointer's distance relative to its neighbour, whatever the panels did to the canvas width.
      expect(Math.abs(before.x - after.x - 120)).toBeLessThan(3);
      expect(Math.abs(before.y - after.y - 80)).toBeLessThan(3);
    });
  }
}

test('a card dragged to the edge pans the canvas and stays visible', async ({ page }) => {
  await open(page, 12);
  const canvas = (await page.locator('.react-flow').boundingBox())!;
  const viewport = () => page.locator('.react-flow__viewport').getAttribute('style');
  const before = await viewport();
  const from = await centre(page, 'Step 6');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width - 6, from.y, { steps: 10 });
  await page.waitForTimeout(700); // the canvas pans while the pointer rests at the edge
  expect(await visible(page)).toBe(12);
  await page.mouse.up();
  expect(await viewport()).not.toBe(before);
  expect(await visible(page)).toBe(12);
  const c = await centre(page, 'Step 6');
  expect(c.x).toBeGreaterThan(canvas.x);
  expect(c.x).toBeLessThan(canvas.x + canvas.width);
  await expect(page.locator('.react-flow__node.selected')).toContainText('Step 6');
});

for (const percent of [20, 200]) {
  test(`a drag works at a zoom of ${percent}%`, async ({ page }) => {
    await open(page, 12);
    await zoomTo(page, percent);
    // The card nearest to the middle of the canvas, so that it is on the screen at 200%.
    const name = await page.evaluate(() => {
      const canvas = document.querySelector('.react-flow')!.getBoundingClientRect();
      const mid = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
      let best = { d: Infinity, text: '' };
      for (const el of document.querySelectorAll('.react-flow__node')) {
        const r = el.getBoundingClientRect();
        const d = Math.hypot(r.x + r.width / 2 - mid.x, r.y + r.height / 2 - mid.y);
        if (d < best.d) best = { d, text: el.textContent ?? '' };
      }
      return /Step \d+/.exec(best.text)![0];
    });
    const n = Number(name.slice(5));
    const other = n === 12 ? 'Step 11' : n === 1 ? 'Step 2' : `Step ${n + 1}`;
    expect([name, other].every((x) => !/^Step 1$/.test(x))).toBe(true); // 'Step 1' would also match Step 10 to 12
    const before = await gapOf(page, name, other);
    const r = await drag(page, name, 100, 40);
    expect(r.minVisible).toBe(12);
    expect(await visible(page)).toBe(12);
    const after = await gapOf(page, name, other);
    expect(Math.abs(before.x - after.x - 100)).toBeLessThan(3);
    expect(Math.abs(before.y - after.y - 40)).toBeLessThan(3);
  });
}
