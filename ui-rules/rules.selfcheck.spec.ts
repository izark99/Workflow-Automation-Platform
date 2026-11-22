import { expect, test } from '@playwright/test';
import { axeSeriousOrCritical, buttonHeights, dangerSpacing, noHintParagraphs, untranslatedText, duplicateButtonNames, forbiddenElements, headerPosition, keyboardFocusRing, noBlurAnimation, noGradient, noStripe, fontSizes, noHorizontalScroll, onePrimary, panelWidth, railShape, sidebarWidth, tableRows } from './rules';

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

test('switch: 40 x 24 px passes, 40 x 40 and 36 x 24 fail', async ({ page }) => {
  await page.setContent(bad('<button role="switch" aria-checked="false" style="width:40px;height:24px;padding:0;border:0"></button>'));
  expect(await buttonHeights(page)).toEqual([]);
  await page.setContent(bad('<button role="switch" aria-checked="false" style="width:40px;height:40px;padding:0;border:0"></button>'));
  expect((await buttonHeights(page)).length).toBe(1);
  await page.setContent(bad('<button role="switch" aria-checked="false" style="width:36px;height:24px;padding:0;border:0"></button>'));
  expect((await buttonHeights(page)).length).toBe(1);
});

test('button heights: 30 and 36 px fail, 32 and 40 pass', async ({ page }) => {
  await page.setContent(bad('<button style="height:30px">a</button>'));
  expect((await buttonHeights(page)).length).toBe(1);
  await page.setContent(bad('<button style="height:36px">a</button>'));
  expect((await buttonHeights(page)).length).toBe(1);
  await page.setContent(bad('<button style="height:32px">a</button><button style="height:40px">b</button>'));
  expect(await buttonHeights(page)).toEqual([]);
});

test('forbidden elements: native select, checkbox, date, a visible file input and a resizable textarea fail', async ({ page }) => {
  await page.setContent(bad('<select></select><input type="checkbox"><input type="date"><input type="file"><textarea style="resize:both"></textarea>'));
  expect((await forbiddenElements(page)).length).toBe(5);
  await page.setContent(bad('<input type="file" style="display:none"><input type="text"><textarea style="resize:none"></textarea>'));
  expect(await forbiddenElements(page)).toEqual([]);
});

test('one primary: two primary buttons fail, one primary with other variants passes', async ({ page }) => {
  await page.setContent(bad('<button data-variant="primary">a</button><button data-variant="primary">b</button>'));
  expect((await onePrimary(page)).length).toBe(1);
  await page.setContent(bad('<button data-variant="primary">a</button><button data-variant="secondary">b</button><button data-variant="ghost">c</button><button data-variant="danger">d</button>'));
  expect(await onePrimary(page)).toEqual([]);
});

test('one primary: a modal dialog is the screen while it is open', async ({ page }) => {
  await page.setContent(bad('<button data-variant="primary">page</button><div role="dialog" aria-modal="true"><button data-variant="primary">confirm</button><button data-variant="secondary">cancel</button></div>'));
  expect(await onePrimary(page)).toEqual([]);
  await page.setContent(bad('<button data-variant="primary">page</button><div role="dialog" aria-modal="true"><button data-variant="primary">a</button><button data-variant="primary">b</button></div>'));
  expect((await onePrimary(page)).length).toBe(1);
});

test('horizontal scroll fails', async ({ page }) => {
  await page.setContent(bad('<div style="width:3000px">wide</div>'));
  expect((await noHorizontalScroll(page)).length).toBe(1);
  await page.setContent(bad('<div>narrow</div>'));
  expect(await noHorizontalScroll(page)).toEqual([]);
});

test('table rows: 44 and 57 px fail, 45 px passes; a dense table takes 37 px and fails 45', async ({ page }) => {
  const table = (attr: string, h: number) => `<div ${attr}><table style="border-collapse:separate;border-spacing:0"><tbody><tr style="height:${h}px"><td>a</td></tr></tbody></table></div>`;
  await page.setContent(bad(table('', 44)));
  expect((await tableRows(page)).length).toBe(1);
  await page.setContent(bad(table('', 57)));
  expect((await tableRows(page)).length).toBe(1);
  await page.setContent(bad(table('', 45)));
  expect(await tableRows(page)).toEqual([]);
  await page.setContent(bad(table('data-dense', 37)));
  expect(await tableRows(page)).toEqual([]);
  await page.setContent(bad(table('data-dense', 45)));
  expect((await tableRows(page)).length).toBe(1);
});

test('header position: a title at y 0 fails, y 23 and block at y 88 pass', async ({ page }) => {
  await page.setContent(bad('<h1>t</h1><div data-first-block>b</div>'));
  expect((await headerPosition(page)).length).toBe(2);
  await page.setContent(bad('<div style="height:23px"></div><h1 style="margin:0;height:38px">t</h1><div style="height:27px"></div><div data-first-block>b</div>'));
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

test('sidebar width: 200 px fails, 240 px passes', async ({ page }) => {
  await page.setContent(bad('<nav aria-label="Main" style="width:200px">x</nav>'));
  expect((await sidebarWidth(page)).length).toBe(1);
  await page.setContent(bad('<nav aria-label="Main" style="width:240px">x</nav>'));
  expect(await sidebarWidth(page)).toEqual([]);
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

test('no blur animation: a blurred panel that animates its width fails; a blurred panel that animates opacity, and a plain panel that animates its width, pass', async ({ page }) => {
  const panel = (style: string) => `<div style="width:100px;height:40px;${style}">p</div>`;
  await page.setContent(bad(panel('backdrop-filter:blur(24px);transition:width 200ms')));
  expect((await noBlurAnimation(page)).length).toBe(1);
  await page.setContent(bad(panel('backdrop-filter:blur(24px);transition:all 200ms')));
  expect((await noBlurAnimation(page)).length).toBe(1);
  await page.setContent(bad(panel('backdrop-filter:blur(24px);transition:opacity 200ms, transform 120ms')));
  expect(await noBlurAnimation(page)).toEqual([]);
  await page.setContent(bad(panel('transition:width 200ms')));
  expect(await noBlurAnimation(page)).toEqual([]);
  await page.setContent(bad(panel('backdrop-filter:blur(24px);transition:width 0s')));
  expect(await noBlurAnimation(page)).toEqual([]);
});

test('no gradient: a gradient on a card or on text fails; the page background (the scene) and a flat fill pass', async ({ page }) => {
  await page.setContent(bad('<div style="background-image:linear-gradient(red,blue);width:40px;height:40px">a</div>'));
  expect((await noGradient(page)).length).toBe(1);
  await page.setContent(bad('<p style="background:linear-gradient(90deg,red,blue);-webkit-background-clip:text;color:transparent">t</p>'));
  expect((await noGradient(page)).length).toBe(1);
  await page.setContent('<!doctype html><html><head><title>t</title></head><body style="background-image:radial-gradient(red,blue)"><div style="background:#ccc;width:40px;height:40px">a</div></body></html>');
  expect(await noGradient(page)).toEqual([]);
});

test('no stripe: a card with a thick border on one side fails; a card with a border all round, and a hairline on one side, pass', async ({ page }) => {
  await page.setContent(bad('<div style="width:200px;height:60px;border-left:4px solid red">a</div>'));
  expect((await noStripe(page)).length).toBe(1);
  await page.setContent(bad('<div style="width:200px;height:60px;border:2px solid red">a</div><div style="width:200px;height:60px;border-bottom:1px solid red">b</div>'));
  expect(await noStripe(page)).toEqual([]);
});

test('font sizes: 11, 17 and 20 px fail; 12, 14, 15 and 28 px pass', async ({ page }) => {
  await page.setContent(bad('<p style="font-size:11px">a</p><p style="font-size:17px">b</p><p style="font-size:20px">c</p>'));
  expect((await fontSizes(page)).length).toBe(3);
  await page.setContent(bad('<p style="font-size:12px">a</p><p style="font-size:14px">b</p><p style="font-size:15px">c</p><p style="font-size:28px">d</p>'));
  expect(await fontSizes(page)).toEqual([]);
});

test('the Harold focus ring: no outline fails, a 2 px primary-text outline at 2 px passes, a ring on the box of a field passes', async ({ page }) => {
  const root = ':root{--primary-text:rgb(26,86,192)}';
  await page.setContent(`<!doctype html><html><head><title>t</title><style>${root} button{outline:none}</style></head><body><button>a</button></body></html>`);
  expect((await keyboardFocusRing(page)).length).toBe(1);
  await page.setContent(`<!doctype html><html><head><title>t</title><style>${root} button:focus-visible{outline:2px solid var(--primary-text);outline-offset:2px}</style></head><body><button>a</button></body></html>`);
  expect(await keyboardFocusRing(page)).toEqual([]);
  await page.setContent(`<!doctype html><html><head><title>t</title><style>${root} .box:focus-within{box-shadow:0 0 0 1px var(--primary-text)} input{outline:none}</style></head><body><div class="box"><input aria-label="x"></div></body></html>`);
  expect(await keyboardFocusRing(page)).toEqual([]);
  await page.setContent(`<!doctype html><html><head><title>t</title><style>:root{--primary-text:rgb(26,86,192);--danger:rgb(179,38,30)} .box:focus-within{box-shadow:0 0 0 1px var(--danger)} input{outline:none}</style></head><body><div class="box"><input aria-label="x" aria-invalid="true"></div></body></html>`);
  expect(await keyboardFocusRing(page)).toEqual([]);
  await page.setContent(`<!doctype html><html><head><title>t</title><style>:root{--primary-text:rgb(26,86,192);--danger:rgb(179,38,30)} .box:focus-within{box-shadow:0 0 0 1px var(--danger)} input{outline:none}</style></head><body><div class="box"><input aria-label="x"></div></body></html>`);
  expect((await keyboardFocusRing(page)).length).toBe(1);
  await page.setContent(`<!doctype html><html><head><title>t</title><style>${root} button:focus-visible{outline:3px solid var(--primary-text);outline-offset:2px}</style></head><body><button>a</button></body></html>`);
  expect((await keyboardFocusRing(page)).length).toBe(1);
});
