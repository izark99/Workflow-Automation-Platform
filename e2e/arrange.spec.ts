import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

// T8.2: Auto arrange (SPEC 15.1). A messy flow becomes ordered in one change, Undo puts the positions back, a selection of two
// or more arranges only those steps, a published version cannot be arranged.
const messy = () => ({
  schemaVersion: 1,
  nodes: [
    { id: 'in', type: 'input_file', label: 'In', position: { x: 700, y: 500 }, settings: {} },
    { id: 'a', type: 'column_mapping', label: 'Alpha', position: { x: 20, y: 40 }, settings: {} },
    { id: 'b', type: 'column_mapping', label: 'Beta', position: { x: 300, y: -200 }, settings: {} },
    { id: 'out', type: 'append', label: 'Join', position: { x: -100, y: 300 }, settings: {} },
  ],
  edges: [
    { source: 'in', target: 'a' },
    { source: 'in', target: 'b' },
    { source: 'a', target: 'out', targetHandle: 'in1' },
    { source: 'b', target: 'out', targetHandle: 'in2' },
  ],
});

async function open(page: Page, status: 'draft' | 'published' = 'draft') {
  const s = seedSnapshot();
  s.flows.push({ id: 'flow-arr', name: 'Arrange test', ownerId: 'user-harold', scope: 'personal', deletedAt: null, groupIds: [], versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status, changeNote: '', definition: messy() }] });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
  await page.goto('/flows/flow-arr/versions/1');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
}

/** Positions in flow units: the screen box divided by the zoom, so the test does not depend on the fitted view. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const zoom = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport') as Element).transform).a;
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const el of document.querySelectorAll<HTMLElement>('.react-flow__node')) {
      const r = el.getBoundingClientRect();
      out[el.dataset.id as string] = { x: r.x / zoom, y: r.y / zoom, w: r.width / zoom, h: r.height / zoom };
    }
    return out;
  });
}

const arrangeButton = (page: Page) => page.getByRole('button', { name: /^Auto arrange/ });

test('Auto arrange orders the whole flow, is one change, and Undo puts every position back', async ({ page }) => {
  await open(page);
  const before = await layout(page);
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await arrangeButton(page).click();
  const toast = page.getByRole('status').filter({ hasText: 'Steps arranged' });
  await expect(toast).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.waitForTimeout(400);
  const p = await layout(page);
  // Columns left to right, 80 px between them, the two middle steps 40 px apart, all of them on one centre line.
  const card = p['in']!;
  expect(Math.abs(card.w - 240)).toBeLessThan(1.5);
  expect(p['a']!.x - (p['in']!.x + p['in']!.w)).toBeCloseTo(80, 0);
  expect(p['out']!.x - (p['a']!.x + p['a']!.w)).toBeCloseTo(80, 0);
  expect(p['b']!.y - (p['a']!.y + p['a']!.h)).toBeCloseTo(40, 0);
  expect(p['a']!.y + p['a']!.h / 2 + (p['b']!.y + p['b']!.h / 2)).toBeCloseTo(2 * (p['in']!.y + p['in']!.h / 2), 0);
  await toast.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(400);
  const after = await layout(page);
  const rel = (l: typeof before) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, { x: Math.round(v.x - l['in']!.x), y: Math.round(v.y - l['in']!.y) }]));
  expect(rel(after)).toEqual(rel(before));
});

test('the toast goes away with the next change', async ({ page }) => {
  await open(page);
  await arrangeButton(page).click();
  const toast = page.getByRole('status').filter({ hasText: 'Steps arranged' });
  await expect(toast).toBeVisible();
  await page.getByRole('button', { name: 'Add step Output' }).click();
  await expect(toast).toHaveCount(0);
});

test('with two steps selected only those steps are arranged, the top left of their box stays', async ({ page }) => {
  await open(page);
  const before = await layout(page);
  await page.locator('.react-flow__node[data-id="a"]').click();
  await page.locator('.react-flow__node[data-id="b"]').click({ modifiers: ['Control'] });
  await arrangeButton(page).click();
  await page.waitForTimeout(400);
  const after = await layout(page);
  // The unselected steps keep their places relative to each other.
  expect(Math.round(after['out']!.x - after['in']!.x)).toBe(Math.round(before['out']!.x - before['in']!.x));
  expect(Math.round(after['out']!.y - after['in']!.y)).toBe(Math.round(before['out']!.y - before['in']!.y));
  // The two selected steps are stacked 40 px apart in one column (they are not connected to each other).
  expect(Math.abs(after['a']!.x - after['b']!.x)).toBeLessThan(1);
});

test('the shortcut arranges, and it does nothing while a field has focus', async ({ page }) => {
  await open(page);
  await page.locator('.react-flow__node[data-id="a"]').click();
  await page.locator('#builder-settings').getByRole('textbox').first().focus();
  await page.keyboard.press('Alt+Shift+KeyA');
  await expect(page.getByText('Steps arranged')).toHaveCount(0);
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Alt+Shift+KeyA');
  await expect(page.getByText('Steps arranged')).toBeVisible();
});

test('a published version cannot be arranged', async ({ page }) => {
  await open(page, 'published');
  await expect(arrangeButton(page)).toBeDisabled();
});
