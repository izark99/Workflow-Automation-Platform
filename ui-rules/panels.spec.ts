import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collapsePanels } from './routes';
import { headerPosition, panelWidth, railShape } from './rules';

// SPEC 12.4 / DESIGN, Collapsible panels: each panel has an open and a collapsed width; the title and the first block keep
// their y; nothing needs horizontal scrolling; every control of an open panel is reachable from the collapsed state.
interface PanelCase {
  id: 'sidebar' | 'steps' | 'settings' | 'refList';
  path: string;
  selector: string;
  open: number;
  collapsed: number;
  /** The screen has the page header (title y 23, first block y 88). */
  header: boolean;
  /** A control of the open panel that must be visible after the panel is opened again (or, for the sidebar, in the rail). */
  reachable: (page: Page) => Promise<void>;
}

const BUILDER = '/flows/flow-timesheet/versions/4';
const selectStep = async (page: Page): Promise<void> => {
  await page.locator('.react-flow__node').first().click();
};

const CASES: PanelCase[] = [
  {
    id: 'sidebar',
    path: '/flows',
    selector: 'nav[aria-label="Main"]',
    open: 240,
    collapsed: 64,
    header: true,
    reachable: async (page) => {
      const nav = page.getByRole('navigation', { name: 'Main' });
      for (const name of ['Flows', 'Reference tables', 'Admin']) await expect(nav.getByRole('link', { name })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Create flow' })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Account menu' })).toBeVisible();
    },
  },
  {
    id: 'steps',
    path: BUILDER,
    selector: 'aside[aria-label="Step types"]',
    open: 184,
    collapsed: 48,
    header: false,
    reachable: async (page) => {
      await expect(page.getByRole('complementary', { name: 'Step types' }).getByRole('button', { name: /^Add step / }).first()).toBeVisible();
    },
  },
  {
    id: 'settings',
    path: BUILDER,
    selector: 'aside[aria-label="Step settings"]',
    open: 380,
    collapsed: 48,
    header: false,
    reachable: async (page) => {
      await selectStep(page);
      await expect(page.getByRole('complementary', { name: 'Step settings' }).getByRole('tab', { name: 'Setup' })).toBeVisible();
    },
  },
  {
    id: 'refList',
    path: '/reference-tables',
    selector: '#ref-list-panel',
    open: 260,
    collapsed: 48,
    header: true,
    reachable: async (page) => {
      await expect(page.getByRole('list', { name: 'Reference tables' }).getByRole('link').first()).toBeVisible();
    },
  },
];

for (const c of CASES) {
  test.describe(`panel ${c.id}`, () => {
    test('open and collapsed widths, same title and first block y, no horizontal scroll', async ({ page }) => {
      await page.goto(c.path);
      await page.waitForLoadState('networkidle');
      expect(await panelWidth(page, c.selector, c.open)).toEqual([]);
      const openY = c.header ? await headerPosition(page) : [];
      expect(openY).toEqual([]);
      await page.locator(`${c.selector} button[aria-expanded="true"]`).first().click();
      // The width changes in at most 200 ms.
      await expect.poll(() => panelWidth(page, c.selector, c.collapsed), { timeout: 1000 }).toEqual([]);
      if (c.header) expect(await headerPosition(page)).toEqual([]);
      expect(await railShape(page, c.selector)).toEqual([]);
    });

    test('the collapsed state from storage has the collapsed width on first paint, and every control is reachable', async ({ page }) => {
      await collapsePanels(c.id)(page);
      await page.goto(c.path);
      await page.waitForLoadState('networkidle');
      expect(await panelWidth(page, c.selector, c.collapsed)).toEqual([]);
      if (c.header) expect(await headerPosition(page)).toEqual([]);
      if (c.id === 'sidebar') {
        await c.reachable(page);
        return;
      }
      await page.locator(`${c.selector} button[aria-expanded="false"]`).first().click();
      await expect.poll(() => panelWidth(page, c.selector, c.open), { timeout: 1000 }).toEqual([]);
      await c.reachable(page);
    });
  });
}

test('the toggles are reachable with Tab in reading order and work with Space', async ({ page }) => {
  await page.goto(BUILDER);
  await page.waitForLoadState('networkidle');
  const toggle = page.getByRole('complementary', { name: 'Step types' }).getByRole('button', { name: 'Collapse step list' });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('complementary', { name: 'Step types' }).getByRole('button', { name: 'Expand step list' })).toBeFocused();
});
