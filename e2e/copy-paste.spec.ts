import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

// T8.5: duplicate, copy and paste of steps (SPEC 15.2 item 3).
const def = (status: 'draft' | 'published', name: string) => ({
  id: name === 'Source flow' ? 'flow-src' : 'flow-dst',
  name,
  ownerId: 'user-harold',
  scope: 'personal' as const,
  deletedAt: null,
  groupIds: [],
  versions: [{
    versionNo: 1, validFrom: '2026-01-01', validTo: null, status, changeNote: '',
    definition: {
      schemaVersion: 1,
      nodes: [
        { id: 'in', type: 'input_file', label: 'Main', position: { x: 0, y: 0 }, settings: { key: 'Main', headerRow: 1 } },
        { id: 'f', type: 'formula_column', label: 'Total', position: { x: 300, y: 0 }, settings: { name: 'Total', expression: '[A]+1' } },
      ],
      edges: [{ source: 'in', target: 'f' }],
    },
  }],
});

async function open(page: Page, status: 'draft' | 'published' = 'draft', path = '/flows/flow-src/versions/1') {
  const s = seedSnapshot();
  s.flows.push(def(status, 'Source flow'), def('draft', 'Target flow'));
  await page.addInitScript((json) => { if (!localStorage.getItem('dfw.seed')) localStorage.setItem('dfw.seed', json); }, JSON.stringify(s));
  await page.goto(path);
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}
const cards = (page: Page) => page.locator('.react-flow__node');
const card = (page: Page, text: string) => cards(page).filter({ hasText: text });
const panel = (page: Page) => page.locator('#builder-settings');
const pasted = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

test('Ctrl+D duplicates the selected step: one more card, " (copy)", selected, the toast, one unsaved change', async ({ page }) => {
  await open(page);
  await card(page, 'Total').click();
  await page.keyboard.press('Control+KeyD');
  await expect(cards(page)).toHaveCount(3);
  await expect(card(page, 'Total (copy)')).toBeVisible();
  await expect(panel(page).getByRole('heading', { name: /Total \(copy\)/ })).toBeVisible();
  await expect(pasted(page, '1 step pasted')).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  // Only the edge between copied steps is copied: the copy has no connection.
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});

test('the Duplicate button of the settings panel does the same', async ({ page }) => {
  await open(page);
  await card(page, 'Main').click();
  await panel(page).getByRole('button', { name: 'Duplicate' }).click();
  await expect(card(page, 'Main (copy)')).toBeVisible();
  await expect(cards(page)).toHaveCount(3);
});

test('copy and paste: two steps keep the edge between them, a second paste moves further, the copies are named (copy) and (copy 2)', async ({ page }) => {
  await open(page);
  await card(page, 'Main').click();
  await card(page, 'Total').click({ modifiers: ['Control'] });
  await page.keyboard.press('Control+KeyC');
  await expect(pasted(page, '2 steps copied')).toBeVisible();
  await page.keyboard.press('Control+KeyV');
  await expect(cards(page)).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(pasted(page, '2 steps pasted')).toBeVisible();
  await page.keyboard.press('Control+KeyV');
  await expect(cards(page)).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  await expect(card(page, 'Main (copy 2)')).toBeVisible();
});

test('paste works in another flow of the same tab, and nothing is sent anywhere', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => { if (r.method() !== 'GET') requests.push(`${r.method()} ${r.url()}`); });
  await open(page);
  await card(page, 'Total').click();
  await page.keyboard.press('Control+KeyC');
  await page.getByRole('banner').getByRole('link', { name: 'Flows' }).click();
  await page.getByRole('link', { name: 'Target flow' }).click();
  await expect(cards(page)).toHaveCount(2);
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+KeyV');
  await expect(cards(page)).toHaveCount(3);
  await expect(card(page, 'Total (copy)')).toBeVisible();
  expect(requests).toEqual([]);
  // The system clipboard is not used.
  const text = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  expect(text).not.toContain('Total');
});

test('the keys do nothing while a field has focus', async ({ page }) => {
  await open(page);
  await card(page, 'Total').click();
  await panel(page).getByRole('textbox', { name: 'Step name' }).focus();
  await page.keyboard.press('Control+KeyD');
  await page.keyboard.press('Control+KeyC');
  await page.keyboard.press('Control+KeyV');
  await expect(cards(page)).toHaveCount(2);
});

test('a published version refuses paste and duplicate', async ({ page }) => {
  await open(page, 'published');
  await card(page, 'Total').click();
  await expect(panel(page).getByRole('button', { name: 'Duplicate' })).toBeDisabled();
  await page.keyboard.press('Control+KeyC');
  await page.keyboard.press('Control+KeyV');
  await page.keyboard.press('Control+KeyD');
  await expect(cards(page)).toHaveCount(2);
});

test('the info button of the step list lists the shortcuts', async ({ page }) => {
  await open(page);
  await page.getByRole('complementary', { name: 'Step types' }).getByRole('button', { name: /^About/ }).click();
  await expect(page.getByText(/Ctrl\+D duplicate, Ctrl\+C copy, Ctrl\+V paste, Delete remove/)).toBeVisible();
});
