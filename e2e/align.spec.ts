import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

// T8.3: align, distribute and Snap to grid (SPEC 15.1 item 4).
const flow = () => ({
  schemaVersion: 1,
  nodes: [
    { id: 'a', type: 'input_file', label: 'Alpha', position: { x: 0, y: 0 }, settings: {} },
    { id: 'b', type: 'input_file', label: 'Beta', position: { x: 300, y: 130 }, settings: {} },
    { id: 'c', type: 'input_file', label: 'Gamma', position: { x: 900, y: 300 }, settings: {} },
    { id: 'd', type: 'input_file', label: 'Delta', position: { x: 100, y: 600 }, settings: {} },
  ],
  edges: [],
});

async function open(page: Page, status: 'draft' | 'published' = 'draft') {
  const s = seedSnapshot();
  s.flows.push({ id: 'flow-align', name: 'Align test', ownerId: 'user-harold', scope: 'personal', deletedAt: null, groupIds: [], versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status, changeNote: '', definition: flow() }] });
  await page.addInitScript((json) => { if (!localStorage.getItem('dfw.seed')) localStorage.setItem('dfw.seed', json); }, JSON.stringify(s));
  await page.goto('/flows/flow-align/versions/1');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
}

async function boxes(page: Page) {
  return page.evaluate(() => {
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const el of document.querySelectorAll<HTMLElement>('.react-flow__node')) {
      const r = el.getBoundingClientRect();
      out[el.dataset.id as string] = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return out;
  });
}

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const tools = (page: Page) => page.getByRole('toolbar', { name: 'Align and distribute' });

async function select(page: Page, ids: string[], settle = true) {
  await node(page, ids[0]!).click();
  for (const id of ids.slice(1)) await node(page, id).click({ modifiers: ['Control'] });
  // The toolbar follows the box of the selection; let it settle before a button is clicked.
  if (!settle) return;
  await expect(tools(page)).toBeVisible();
  await page.waitForTimeout(250);
}

test('the toolbar shows for two or more selected steps, and distribute needs three', async ({ page }) => {
  await open(page);
  await node(page, 'a').click();
  await expect(tools(page)).toHaveCount(0);
  await select(page, ['a', 'b']);
  await expect(tools(page)).toBeVisible();
  await expect(tools(page).getByRole('button', { name: 'Distribute horizontally' })).toBeDisabled();
  await node(page, 'c').click({ modifiers: ['Control'] });
  await expect(tools(page).getByRole('button', { name: 'Distribute horizontally' })).toBeEnabled();
  // 32 px buttons
  const h = await tools(page).getByRole('button').first().boundingBox();
  expect(h!.height).toBe(32);
});

for (const [name, axis, edge] of [
  ['Align left', 'x', 'start'],
  ['Align right', 'x', 'end'],
  ['Align centre', 'x', 'mid'],
  ['Align top', 'y', 'start'],
  ['Align bottom', 'y', 'end'],
  ['Align middle', 'y', 'mid'],
] as const) {
  test(`${name} puts the selected steps on one line and leaves the others`, async ({ page }) => {
    await open(page);
    await select(page, ['a', 'b', 'c']);
    // Measured after the selection: opening the settings panel can change the size of the canvas and move the view.
    const before = await boxes(page);
    await tools(page).getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(200);
    const after = await boxes(page);
    const pos = (b: { x: number; y: number; w: number; h: number }) => {
      const s = axis === 'x' ? b.x : b.y;
      const size = axis === 'x' ? b.w : b.h;
      return edge === 'start' ? s : edge === 'end' ? s + size : s + size / 2;
    };
    expect(Math.abs(pos(after['a']!) - pos(after['b']!))).toBeLessThan(1.5);
    expect(Math.abs(pos(after['b']!) - pos(after['c']!))).toBeLessThan(1.5);
    expect(Math.abs(after['d']!.x - before['d']!.x) + Math.abs(after['d']!.y - before['d']!.y)).toBeLessThan(1.5);
    await expect(page.getByText('Unsaved changes')).toBeVisible();
  });
}

test('Distribute horizontally makes equal gaps and keeps the two outer steps', async ({ page }) => {
  await open(page);
  await select(page, ['a', 'b', 'c']);
  const before = await boxes(page);
  await tools(page).getByRole('button', { name: 'Distribute horizontally' }).click();
  await page.waitForTimeout(200);
  const a = await boxes(page);
  expect(Math.abs(a['a']!.x - before['a']!.x)).toBeLessThan(1.5);
  expect(Math.abs(a['c']!.x - before['c']!.x)).toBeLessThan(1.5);
  const g1 = a['b']!.x - (a['a']!.x + a['a']!.w);
  const g2 = a['c']!.x - (a['b']!.x + a['b']!.w);
  expect(Math.abs(g1 - g2)).toBeLessThan(1.5);
});

test('the toolbar works from the keyboard: arrow keys move between its buttons and Enter acts', async ({ page }) => {
  await open(page);
  await select(page, ['a', 'b', 'c']);
  await tools(page).getByRole('button').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tools(page).getByRole('button', { name: 'Align centre' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(tools(page).getByRole('button', { name: 'Distribute vertically' })).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const a = await boxes(page);
  expect(Math.abs(a['a']!.x - a['b']!.x)).toBeLessThan(1.5);
});

test('Snap to grid is kept in the browser and puts a dropped card on the 8 px grid', async ({ page }) => {
  await open(page);
  const snap = page.getByRole('button', { name: 'Snap to grid' });
  await expect(snap).toHaveAttribute('aria-pressed', 'false');
  await snap.click();
  await expect(snap).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Snap to grid' })).toHaveAttribute('aria-pressed', 'true');
  const b = (await node(page, 'd').boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + 47, b.y + 33, { steps: 6 });
  await page.mouse.up();
  const t = await node(page, 'd').evaluate((el) => (el as HTMLElement).style.transform);
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(t)!;
  expect(Number(m[1]) % 8).toBe(0);
  expect(Number(m[2]) % 8).toBe(0);
});

test('a published version has no toolbar', async ({ page }) => {
  await open(page, 'published');
  await select(page, ['a', 'b'], false);
  await expect(tools(page)).toHaveCount(0);
});
