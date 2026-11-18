import { expect, test } from '@playwright/test';
import { axeSeriousOrCritical, buttonHeights, dangerSpacing, duplicateButtonNames, forbiddenElements, headerPosition, keyboardFocusRing, noHorizontalScroll, oneCta, sidebarWidth, tableRows } from './rules';

// Each rule must fail on a page that breaks it, and pass on a page that does not.
const bad = (html: string) => `<!doctype html><html lang="en"><head><title>t</title></head><body style="margin:0">${html}</body></html>`;

test('button heights: 30 px fails, 36 and 40 pass', async ({ page }) => {
  await page.setContent(bad('<button style="height:30px">a</button>'));
  expect((await buttonHeights(page)).length).toBe(1);
  await page.setContent(bad('<button style="height:36px">a</button><button style="height:40px">b</button>'));
  expect(await buttonHeights(page)).toEqual([]);
});

test('forbidden elements: native select, checkbox, date, a visible file input and a resizable textarea fail', async ({ page }) => {
  await page.setContent(bad('<select></select><input type="checkbox"><input type="date"><input type="file"><textarea style="resize:both"></textarea>'));
  expect((await forbiddenElements(page)).length).toBe(5);
  await page.setContent(bad('<input type="file" style="display:none"><input type="text"><textarea style="resize:none"></textarea>'));
  expect(await forbiddenElements(page)).toEqual([]);
});

test('one cta: two fail', async ({ page }) => {
  await page.setContent(bad('<button data-variant="cta">a</button><button data-variant="cta">b</button>'));
  expect((await oneCta(page)).length).toBe(1);
  await page.setContent(bad('<button data-variant="cta">a</button>'));
  expect(await oneCta(page)).toEqual([]);
});

test('horizontal scroll fails', async ({ page }) => {
  await page.setContent(bad('<div style="width:3000px">wide</div>'));
  expect((await noHorizontalScroll(page)).length).toBe(1);
  await page.setContent(bad('<div>narrow</div>'));
  expect(await noHorizontalScroll(page)).toEqual([]);
});

test('table rows: 56 px fails, 57 px passes', async ({ page }) => {
  await page.setContent(bad('<table><tbody><tr style="height:56px"><td>a</td></tr></tbody></table>'));
  expect((await tableRows(page)).length).toBe(1);
  await page.setContent(bad('<table style="border-collapse:separate;border-spacing:0"><tbody><tr style="height:57px"><td>a</td></tr></tbody></table>'));
  expect(await tableRows(page)).toEqual([]);
});

test('header position: a title at y 0 fails, y 63 and block at y 148 pass', async ({ page }) => {
  await page.setContent(bad('<h1>t</h1><div data-first-block>b</div>'));
  expect((await headerPosition(page)).length).toBe(2);
  await page.setContent(bad('<div style="height:63px"></div><h1 style="margin:0;height:36px">t</h1><div style="height:49px"></div><div data-first-block>b</div>'));
  expect(await headerPosition(page)).toEqual([]);
});

test('axe: an image without alt text fails', async ({ page }) => {
  await page.setContent(bad('<main><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main>'));
  expect((await axeSeriousOrCritical(page)).length).toBeGreaterThan(0);
});

test('row buttons: two "Open" buttons in a table fail without aria-labels, pass with distinct ones, and fail with the same one', async ({ page }) => {
  await page.setContent(bad('<table><tbody><tr><td><button>Open</button></td></tr><tr><td><button>Open</button></td></tr></tbody></table>'));
  expect((await duplicateButtonNames(page)).length).toBe(1);
  await page.setContent(bad('<table><tbody><tr><td><button aria-label="Open A">Open</button></td></tr><tr><td><button aria-label="Open B">Open</button></td></tr></tbody></table>'));
  expect(await duplicateButtonNames(page)).toEqual([]);
  await page.setContent(bad('<table><tbody><tr><td><button aria-label="Open A">Open</button></td></tr><tr><td><button aria-label="Open A">Open</button></td></tr></tbody></table>'));
  expect((await duplicateButtonNames(page)).length).toBe(1);
  await page.setContent(bad('<table><tbody><tr><td><button>Open</button><button>Delete</button></td></tr></tbody></table>'));
  expect(await duplicateButtonNames(page)).toEqual([]);
});

test('danger spacing: a danger button 4 px from its neighbour fails, 8 px passes', async ({ page }) => {
  const row = (gapPx: number) => bad(`<div style="display:flex;gap:${gapPx}px"><button style="height:36px">Cancel</button><button data-variant="danger" style="height:36px">Delete</button></div>`);
  await page.setContent(row(4));
  expect((await dangerSpacing(page)).length).toBe(1);
  await page.setContent(row(8));
  expect(await dangerSpacing(page)).toEqual([]);
});

test('sidebar width: 200 px fails, 232 px passes', async ({ page }) => {
  await page.setContent(bad('<nav aria-label="Main" style="width:200px">x</nav>'));
  expect((await sidebarWidth(page)).length).toBe(1);
  await page.setContent(bad('<nav aria-label="Main" style="width:232px">x</nav>'));
  expect(await sidebarWidth(page)).toEqual([]);
});

test('keyboard focus ring: a button with no outline fails, one with a 2 px outline passes, a wrapper that shows the ring counts', async ({ page }) => {
  await page.setContent(bad('<button style="outline:none">a</button>'));
  expect((await keyboardFocusRing(page)).length).toBe(1);
  await page.setContent(bad('<button style="outline:2px solid #0d9488">a</button>'));
  expect(await keyboardFocusRing(page)).toEqual([]);
  await page.setContent(bad('<label style="display:inline-block" class="w"><style>.w:focus-within{outline:2px solid #0d9488}</style><input type="text" style="outline:0"></label>'));
  expect(await keyboardFocusRing(page)).toEqual([]);
});
