// The estimate of the pages of a printed sheet (SPEC 16.1 item 5): how many rows fit on a page, and whether the signature block
// fits on what is left of the last page. Excel decides the real breaks; this is the rule of the writer, tested on the estimate.
import type { Margins, Orientation, Paper } from './settings';

/** Sizes of the paper in points (1/72 inch), portrait. */
export const PAPER_POINTS: Readonly<Record<Paper, { width: number; height: number }>> = {
  A4: { width: 595.28, height: 841.89 },
  A3: { width: 841.89, height: 1190.55 },
  Letter: { width: 612, height: 792 },
};

/** The margins of Excel in points: left and right, top and bottom. */
export const MARGIN_POINTS: Readonly<Record<Margins, { side: number; topBottom: number }>> = {
  normal: { side: 0.7 * 72, topBottom: 0.75 * 72 },
  narrow: { side: 0.25 * 72, topBottom: 0.75 * 72 },
  wide: { side: 72, topBottom: 72 },
};

/** The height of a row of normal text, and of one line of wrapped text, in points. */
export const ROW_POINTS = 15;
/** The height of the line of a header line by its size, in points. */
export const LINE_POINTS = { normal: 15, large: 21, xlarge: 27 } as const;
/** The font sizes of the header lines by their size, in points. */
export const FONT_POINTS = { normal: 11, large: 14, xlarge: 18 } as const;

export interface PageSetup {
  paper: Paper;
  orientation: Orientation;
  margins: Margins;
  fitWidth: boolean;
}

/** The size of the printable area of a page in points. */
export function printableArea(p: PageSetup): { width: number; height: number } {
  const paper = PAPER_POINTS[p.paper];
  const page = p.orientation === 'landscape' ? { width: paper.height, height: paper.width } : paper;
  const m = MARGIN_POINTS[p.margins];
  return { width: page.width - 2 * m.side, height: page.height - 2 * m.topBottom };
}

/** The width of a column of `chars` characters in points (7 pixels a character and 5 of padding, at 96 dpi). */
export const columnPoints = (chars: number): number => (chars * 7 + 5) * 0.75;

/** The scale that "fit all columns on one page wide" gives: 1 when the columns fit, less when they do not. 1 when it is off. */
export function fitScale(p: PageSetup, columnWidths: readonly number[]): number {
  if (!p.fitWidth) return 1;
  const total = columnWidths.reduce((sum, w) => sum + columnPoints(w), 0);
  const { width } = printableArea(p);
  return total <= width ? 1 : width / total;
}

export interface PageLayout {
  /** The height of everything above the header row of the table, in points. */
  aboveTable: number;
  /** The height of the header row of the table, in points. */
  tableHeader: number;
  /** The height of each row of the table, in points. */
  rows: readonly number[];
  /** The header row is repeated at the top of every page after the first. */
  repeatHeader: boolean;
  /** The height of a page in points, as the content is measured (the printable height divided by the scale). */
  capacity: number;
}

export interface PagesUsed {
  pages: number;
  /** The height used on the last page, in points. */
  usedOnLastPage: number;
}

/** Puts the rows on pages in order and says how many pages there are and how full the last one is. */
export function paginate(layout: PageLayout): PagesUsed {
  let pages = 1;
  let used = layout.aboveTable + layout.tableHeader;
  const carried = layout.repeatHeader ? layout.tableHeader : 0;
  for (const h of layout.rows) {
    if (used + h > layout.capacity && used > carried) {
      pages += 1;
      used = carried;
    }
    used += h;
  }
  return { pages, usedOnLastPage: used };
}

/**
 * Does the signature block (`blockHeight` points, with `gap` of space before it) fit on what is left of the last page? When it does
 * not, the writer puts a page break before it, so that the block is never cut in two.
 */
export function signatureFits(layout: PageLayout, blockHeight: number, gap = ROW_POINTS): boolean {
  const { usedOnLastPage } = paginate(layout);
  return usedOnLastPage + gap + blockHeight <= layout.capacity;
}

/** The lines that a text takes in a cell `chars` characters wide (at least 1): the height of a wrapped row. */
export function wrappedLines(text: string, chars: number): number {
  if (text === '') return 1;
  return text.split(/\r?\n/).reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / Math.max(1, chars))), 0);
}
