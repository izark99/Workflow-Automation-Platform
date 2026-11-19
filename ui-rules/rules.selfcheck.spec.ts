import { expect, test } from '@playwright/test';
import { axeSeriousOrCritical, buttonHeights, dangerSpacing, noHintParagraphs, untranslatedText, duplicateButtonNames, forbiddenElements, headerPosition, keyboardFocusRing, noHorizontalScroll, oneCta, panelWidth, railShape, sidebarWidth, tableRows } from './rules';

// Each rule must fail on a page that breaks it, and pass on a page that does not.
const bad = (html: string) => `<!doctype html><html lang="en"><head><title>t</title></head><body style="margin:0">${html}</body></html>`;

test('hint paragraphs: a visible element with a hint class fails, a note and a hidden hint pass', async ({ page }) => {
  await page.setContent(bad('<p class="_hint_x1">Explains something</p>'));
  expect((await noHintParagraphs(page)).length).toBe(1);
  await page.setContent(bad('<p class="_note_x1">State</p><p class="_hint_x1" style="display:none">h</p>'));
  expect(await noHintParagraphs(page)).toEqual([]);
});

test('info button: 24 x 24 px passes, 26 x 26 and 24 x 36 fail', async ({ page }) => {
  await page.setContent(bad('<button data-infotip style="width:24px;height:24px;padding:0;border:0">i</button>'));
  expect(await buttonHeights(page)).toEqual([]);
  await page.setContent(bad('<button data-infotip style="width:26px;height:26px;padding:0;border:0">i</button>'));
  expect((await buttonHeights(page)).length).toBe(1);
  await page.setContent(bad('<button data-infotip style="width:24px;height:36px;padding:0;border:0">i</button>'));
  expect((await buttonHeights(page)).length).toBe(1);
});

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

test('header position: a title at y 0 fails, y 63 and block at y 123 pass', async ({ page }) => {
  await page.setContent(bad('<h1>t</h1><div data-first-block>b</div>'));
  expect((await headerPosition(page)).length).toBe(2);
  await page.setContent(bad('<div style="height:63px"></div><h1 style="margin:0;height:36px">t</h1><div style="height:24px"></div><div data-first-block>b</div>'));
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

test('pseudo-locale: a text outside the markers fails, marked text, user content and digits pass', async ({ page }) => {
  await page.setContent(bad('<main><p>Plain text</p></main>'));
  expect((await untranslatedText(page, 'main')).length).toBe(1);
  await page.setContent(bad('<main><p>\u27E6Flows\u27E7</p><p data-user-content>Harold</p><p>12 / 30</p><input placeholder="\u27E6Name\u27E7"></main>'));
  expect(await untranslatedText(page, 'main')).toEqual([]);
  await page.setContent(bad('<main><input placeholder="Name"><button aria-label="Close">1</button></main>'));
  expect((await untranslatedText(page, 'main')).length).toBe(2);
});

test('panel width: a panel of the wrong width fails, the right width passes, a wide page fails', async ({ page }) => {
  await page.setContent(bad('<aside id="p" style="width:100px">x</aside>'));
  expect((await panelWidth(page, '#p', 48)).length).toBe(1);
  await page.setContent(bad('<aside id="p" style="width:48px">x</aside>'));
  expect(await panelWidth(page, '#p', 48)).toEqual([]);
  expect((await panelWidth(page, '#missing', 48)).length).toBe(1);
  await page.setContent(bad('<aside id="p" style="width:48px">x</aside><div style="width:4000px;height:1px"></div>'));
  expect((await panelWidth(page, '#p', 48)).length).toBe(1);
});

test('rail shape: a wide button or an unnamed button fails, a named icon button passes', async ({ page }) => {
  await page.setContent(bad('<aside id="p" style="width:48px;overflow:hidden"><button style="width:120px">Wide</button></aside>'));
  expect((await railShape(page, '#p')).length).toBe(1);
  await page.setContent(bad('<aside id="p" style="width:48px;overflow:hidden"><button style="width:36px"></button></aside>'));
  expect((await railShape(page, '#p')).length).toBe(1);
  await page.setContent(bad('<aside id="p" style="width:48px;overflow:hidden"><button aria-label="Expand" style="width:36px"></button></aside>'));
  expect(await railShape(page, '#p')).toEqual([]);
});
