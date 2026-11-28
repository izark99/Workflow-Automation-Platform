import { describe, expect, it } from 'vitest';
import { columnPoints, fitScale, paginate, printableArea, ROW_POINTS, signatureFits, wrappedLines } from './pagination';
import type { PageLayout, PageSetup } from './pagination';

const a4: PageSetup = { paper: 'A4', orientation: 'portrait', margins: 'normal', fitWidth: true };
const layout = (over: Partial<PageLayout> = {}): PageLayout => ({ aboveTable: 0, tableHeader: ROW_POINTS, rows: [], repeatHeader: true, capacity: 600, ...over });
const rows = (n: number, h = ROW_POINTS): number[] => Array.from({ length: n }, () => h);

describe('the printable area', () => {
  it('is the paper less the margins: A4 portrait with normal margins, A4 landscape, A3, Letter', () => {
    const p = printableArea(a4);
    expect(p.width).toBeCloseTo(595.28 - 2 * 50.4, 1);
    expect(p.height).toBeCloseTo(841.89 - 2 * 54, 1);
    expect(printableArea({ ...a4, orientation: 'landscape' }).width).toBeCloseTo(841.89 - 2 * 50.4, 1);
    expect(printableArea({ ...a4, paper: 'A3' }).height).toBeGreaterThan(p.height);
    expect(printableArea({ ...a4, paper: 'Letter' }).width).toBeCloseTo(612 - 2 * 50.4, 1);
    expect(printableArea({ ...a4, margins: 'narrow' }).width).toBeGreaterThan(p.width);
  });
});

describe('the scale of fit to one page wide', () => {
  it('is 1 when the columns fit, less when they do not, and 1 when the option is off', () => {
    expect(fitScale(a4, [10, 10, 10])).toBe(1);
    const wide = Array.from({ length: 20 }, () => 20);
    const s = fitScale(a4, wide);
    expect(s).toBeLessThan(1);
    expect(s * wide.reduce((a, w) => a + columnPoints(w), 0)).toBeCloseTo(printableArea(a4).width, 3);
    expect(fitScale({ ...a4, fitWidth: false }, wide)).toBe(1);
  });
  it('landscape lets more columns fit than portrait', () => {
    const cols = Array.from({ length: 12 }, () => 14);
    expect(fitScale({ ...a4, orientation: 'landscape' }, cols)).toBeGreaterThan(fitScale(a4, cols));
  });
});

describe('the pages of a sheet', () => {
  it('puts the rows on the first page while they fit, and counts the used height', () => {
    // capacity 600: header 15 + 30 rows of 15 = 465.
    const r = paginate(layout({ rows: rows(30) }));
    expect(r).toEqual({ pages: 1, usedOnLastPage: 15 + 30 * 15 });
  });
  it('starts a new page when a row does not fit, and repeats the header row on it', () => {
    // 600 / 15 = 40 rows on page 1 (the header is one), so 39 data rows; the 40th data row opens page 2 with the header again.
    const r = paginate(layout({ rows: rows(40) }));
    expect(r.pages).toBe(2);
    expect(r.usedOnLastPage).toBe(15 + 15);
  });
  it('counts the lines above the table on the first page only, and does not repeat the header when it is off', () => {
    const a = paginate(layout({ aboveTable: 120, rows: rows(60) }));
    expect(a.pages).toBe(2);
    const norepeat = paginate(layout({ rows: rows(40), repeatHeader: false }));
    expect(norepeat.usedOnLastPage).toBe(15);
  });
  it('lets a row taller than a page stand on a page of its own instead of looping', () => {
    const r = paginate(layout({ rows: [900, 15] }));
    expect(r.pages).toBe(2);
  });
});

describe('the signature block never leaves the page cut in two', () => {
  const block = 7 * ROW_POINTS;
  it('fits when there is room on the last page, with a row of space before it', () => {
    // used 15 + 20 * 15 = 315, + 15 gap + 105 block = 435 <= 600.
    expect(signatureFits(layout({ rows: rows(20) }), block)).toBe(true);
  });
  it('does not fit when what is left is smaller than the block, so a page break goes before it', () => {
    // used 15 + 36 * 15 = 555; 555 + 15 + 105 > 600.
    expect(signatureFits(layout({ rows: rows(36) }), block)).toBe(false);
  });
  it('fits exactly when the block ends at the last point of the page', () => {
    // used 15 + n * 15; 15 + n * 15 + 15 + 105 = 600 for n = 31.
    expect(signatureFits(layout({ rows: rows(31) }), block)).toBe(true);
    expect(signatureFits(layout({ rows: rows(32) }), block)).toBe(false);
  });
  it('uses the last page, not the first: after a page break the room is that of the new page', () => {
    // 100 rows = 3 pages (39, 38, 23 data rows: used 15 + 15 + ... ), the last page is nearly empty.
    expect(signatureFits(layout({ rows: rows(100) }), block)).toBe(true);
    expect(paginate(layout({ rows: rows(100) })).pages).toBe(3);
  });
  it('an empty table fits a block on the first page', () => {
    expect(signatureFits(layout({ aboveTable: 100 }), block)).toBe(true);
  });
});

describe('wrapped text', () => {
  it('counts the lines of a text in a column of some characters, and the line breaks', () => {
    expect(wrappedLines('', 10)).toBe(1);
    expect(wrappedLines('short', 10)).toBe(1);
    expect(wrappedLines('a'.repeat(25), 10)).toBe(3);
    expect(wrappedLines('one\ntwo', 10)).toBe(2);
  });
});
