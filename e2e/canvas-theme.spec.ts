import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedParameterFlow } from './parameter-flow';

// The canvas follows the app theme, never the operating system on its own (SPEC 11.4).
/** A new flow with two connected steps, so the canvas shows a node, an edge and the dots. */
async function openCanvasWithEdge(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Theme test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await page.getByRole('button', { name: 'Add step Column mapping' }).click();
  await page.getByRole('button', { name: 'Add step Output' }).click();
  const handle = async (text: string, side: string) =>
    (await page.locator('.react-flow__node').filter({ hasText: text }).locator(`.react-flow__handle.${side}`).first().boundingBox())!;
  const a = await handle('Column mapping', 'source');
  const b = await handle('Output', 'target');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
}

async function colours(page: Page) {
  return page.evaluate(() => {
    const flow = document.querySelector('.react-flow') as HTMLElement;
    const edge = document.querySelector('.react-flow__edge-path') as SVGPathElement;
    const dots = document.querySelector('.react-flow__background-pattern') as SVGElement;
    const attribution = document.querySelector('.react-flow__attribution') as HTMLElement | null;
    return {
      background: getComputedStyle(flow).backgroundColor,
      edge: getComputedStyle(edge).stroke,
      dots: getComputedStyle(dots).fill,
      scheme: getComputedStyle(flow).colorScheme,
      attribution: attribution ? getComputedStyle(attribution).backgroundColor : null,
    };
  });
}

test('operating system dark, app Light: the canvas background, dots, edges and attribution are light', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dfw.theme', 'light'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await openCanvasWithEdge(page);
  const c = await colours(page);
  expect(c.scheme).toBe('light');
  expect(c.background).toBe('rgb(240, 253, 250)');
  expect(c.dots).toBe('rgb(153, 246, 228)');
  expect(c.edge).toBe('rgb(111, 145, 141)');
  expect(c.attribution).not.toBe('rgba(150, 150, 150, 0.25)');
});

test('operating system light, app Dark: the canvas is dark', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dfw.theme', 'dark'));
  await page.emulateMedia({ colorScheme: 'light' });
  await openCanvasWithEdge(page);
  const c = await colours(page);
  expect(c.scheme).toBe('dark');
  expect(c.background).toBe('rgb(14, 26, 25)');
  expect(c.dots).toBe('rgb(42, 74, 70)');
  expect(c.edge).toBe('rgb(110, 147, 142)');
});

test('after fit to screen no step card sits under the control bar, on load and after the Fit button', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  const overlaps = async (): Promise<string[]> =>
    page.evaluate(() => {
      const bar = document.querySelector('[role="toolbar"]')!.getBoundingClientRect();
      const hits: string[] = [];
      for (const n of Array.from(document.querySelectorAll('.react-flow__node'))) {
        const r = n.getBoundingClientRect();
        if (r.left < bar.right && r.right > bar.left && r.top < bar.bottom && r.bottom > bar.top) hits.push((n.textContent ?? '').slice(0, 30));
      }
      return hits;
    });
  await page.waitForTimeout(400);
  expect(await overlaps()).toEqual([]);
  await page.getByRole('button', { name: 'Fit to screen' }).click();
  await page.waitForTimeout(500);
  expect(await overlaps()).toEqual([]);
});

test('the output labels of a Filter card are 12 px and sit beside the connection line, not on it', async ({ page }) => {
  await seedParameterFlow(page);
  await page.goto('/flows/flow-param/versions/2');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  const found = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.react-flow__node')).find((n) => (n.textContent ?? '').includes('Keep'))!;
    const handles = Array.from(card.querySelectorAll('.react-flow__handle.source')).map((h) => {
      const r = h.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    const labels = Array.from(card.querySelectorAll('[aria-hidden="true"]')).filter((l) => /match/i.test(l.textContent ?? ''));
    return labels.map((l) => {
      const r = l.getBoundingClientRect();
      return { text: l.textContent, size: parseFloat(getComputedStyle(l).fontSize), left: r.left, right: r.right, crossed: handles.filter((x) => x > r.left && x < r.right).length };
    });
  });
  expect(found.map((f) => f.text)).toEqual(['match', 'no match']);
  for (const f of found) {
    expect(f.size).toBeGreaterThanOrEqual(12);
    expect(f.crossed, `${f.text} is crossed by a connection line`).toBe(0);
  }
});
