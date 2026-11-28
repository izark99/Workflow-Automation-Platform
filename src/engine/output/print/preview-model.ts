// The model of the print preview (SPEC 16.1 item 8): what the first page and the last page of a printed sheet hold, from the settings
// and the first and last rows of a preview. It is an estimate with the rules of the writer (`pagination.ts`): Excel decides the page
// breaks in the middle. No React, no ExcelJS.
import { LINE_POINTS, ROW_POINTS, fitScale, paginate, printableArea, signatureFits } from './pagination';
import type { PageLayout } from './pagination';
import type { PrintLanguage } from './language';
import type { PrintLine, PrintSettings, PrintSigner } from './settings';
import { resolvedTexts } from './tokens';
import type { TokenContext } from './tokens';
import { signatureRowCount } from './signature-rows';

export interface PreviewPage {
  number: number;
  total: number;
  /** Width over height of the paper in its orientation. */
  ratio: number;
  /** The header lines (the first page only). */
  lines: PrintLine[];
  /** The header row of the table, or null when this page does not show it. */
  header: string[] | null;
  rows: (readonly string[])[];
  /** Rows that are not drawn before or after these ones. */
  gapBefore: boolean;
  gapAfter: boolean;
  /** The signature block, or null when it is not on this page. */
  signature: { dateLine: string; signers: PrintSigner[] } | null;
  /** "Trang 2/5", or null when the page numbers are off. */
  footer: string | null;
}

export interface PreviewInput {
  print: PrintSettings;
  tokens: TokenContext;
  language: PrintLanguage;
  columns: readonly string[];
  /** The formatted cells of the first rows and of the last rows of the table. */
  firstRows: readonly (readonly string[])[];
  lastRows: readonly (readonly string[])[];
  totalRows: number;
}

export interface PrintPreview {
  /** The estimated number of pages. */
  pages: number;
  first: PreviewPage;
  /** Null when the report is one page. */
  last: PreviewPage | null;
}

export const footerText = (language: PrintLanguage, n: number, total: number): string => `${language === 'vi' ? 'Trang' : 'Page'} ${n}/${total}`;

const widthOf = (name: string): number => Math.min(50, Math.max(8, name.length + 2));

export function previewPages(input: PreviewInput): PrintPreview {
  const print = resolvedTexts(input.print, input.tokens);
  const page = { paper: print.paper, orientation: print.orientation, margins: print.margins, fitWidth: print.fitWidth };
  const area = printableArea(page);
  const scale = fitScale(page, input.columns.map(widthOf));
  const capacity = area.height / scale;
  const above = print.header.length === 0 ? 0 : print.header.reduce((sum, l) => sum + LINE_POINTS[l.size], 0) + ROW_POINTS;
  const layout: PageLayout = { aboveTable: above, tableHeader: ROW_POINTS, rows: Array.from({ length: input.totalRows }, () => ROW_POINTS), repeatHeader: print.repeatHeader, capacity };
  const { pages: dataPages, usedOnLastPage } = paginate(layout);
  const hasBlock = print.signers.length > 0;
  const fits = !hasBlock || signatureFits(layout, signatureRowCount(print) * ROW_POINTS);
  const total = dataPages + (fits ? 0 : 1);
  const ratio = area.width / area.height;
  const signature = hasBlock ? { dateLine: print.dateLine, signers: print.signers } : null;
  const footer = (n: number): string | null => (print.pageNumbers ? footerText(input.language, n, total) : null);

  const rowsOnFirst = Math.max(0, Math.floor((capacity - above - ROW_POINTS) / ROW_POINTS));
  const firstCount = Math.min(rowsOnFirst, input.totalRows);
  const firstRows = input.firstRows.slice(0, firstCount);
  const first: PreviewPage = {
    number: 1,
    total,
    ratio,
    lines: print.header,
    header: [...input.columns],
    rows: firstRows,
    gapBefore: false,
    gapAfter: input.totalRows > firstRows.length && (dataPages > 1 || firstRows.length < input.totalRows),
    signature: total === 1 ? signature : null,
    footer: footer(1),
  };
  if (total === 1) return { pages: 1, first, last: null };

  const carried = print.repeatHeader ? ROW_POINTS : 0;
  let last: PreviewPage;
  if (!fits) {
    // The block does not fit on the last page of the rows: it opens a page of its own, with the header row repeated.
    last = { number: total, total, ratio, lines: [], header: print.repeatHeader ? [...input.columns] : null, rows: [], gapBefore: false, gapAfter: false, signature, footer: footer(total) };
  } else {
    const used = usedOnLastPage - (dataPages === 1 ? above + ROW_POINTS : carried);
    const count = Math.min(input.lastRows.length, Math.max(0, Math.round(used / ROW_POINTS)));
    const rows = count === 0 ? [] : input.lastRows.slice(-count);
    last = { number: total, total, ratio, lines: [], header: print.repeatHeader ? [...input.columns] : null, rows, gapBefore: input.totalRows > rows.length, gapAfter: false, signature, footer: footer(total) };
  }
  return { pages: total, first, last };
}
