import type { EngineMessageId, MessageParams } from '../messages';
import { columnLetters } from '../input/region';
import type { StopRule } from '../input/region';
import type { Grid, RawCell } from '../refimport/types';
import { FOOTER_WORDS, TOTAL_WORDS } from './footer-words';

// The analysis of a sample file (SPEC 13.2 item 3): where is the table in a sheet, and how should an Input step read it?
// It proposes; the person applies. It is pure (no React, no Supabase, no network), deterministic, and reads at most 2,000 rows
// and 100 columns of one sheet. Every proposal has a confidence and a reason (a message id with parameters).

export const MAX_ANALYZE_ROWS = 2000;
export const MAX_ANALYZE_COLUMNS = 100;

export type Confidence = 'high' | 'medium' | 'low';

export interface Reason {
  id: EngineMessageId;
  params: MessageParams;
}

export interface Proposed<T> {
  value: T;
  confidence: Confidence;
  reason: Reason;
}

/** A table in a sheet, in 1-based rows and columns. */
export interface TableRegion {
  headerRow: number;
  firstColumn: number;
  lastColumn: number;
  lastRow: number;
}

export interface LayoutAnalysis {
  /** False when no table was found. The proposals are then absent and `noTable` says why. */
  found: boolean;
  noTable?: Reason;
  headerRow?: Proposed<number>;
  firstColumn?: Proposed<number>;
  lastColumn?: Proposed<number>;
  stopAt?: Proposed<StopRule>;
  /** The names of the header (the columns that the file must have). */
  expect?: Proposed<string[]>;
  /** Columns that look like merged cells. */
  fillDown?: Proposed<string[]>;
  /** Rows inside the table that look like totals. */
  ignoreRows?: Proposed<{ column: string; text: string }[]>;
  /** The first table: where it is, in 1-based rows and columns. */
  region?: TableRegion;
  /** The column names that the table has, empty names as `Column N`. */
  columns: string[];
  /** The rows that are not read, as 1-based ranges: the title above the header, the footer under the table. */
  leftOut: { title?: [number, number]; footer?: [number, number] };
  /** The other tables that were found after the first one. */
  otherTables: TableRegion[];
  rowsRead: number;
  /** True when the sheet has more rows or columns than were read. */
  truncated: boolean;
}

export interface AnalyzeOptions {
  maxRows?: number;
  maxColumns?: number;
}

const filled = (v: RawCell | undefined): boolean => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');
const asText = (v: RawCell | undefined): string => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const numberLike = (v: RawCell | undefined): boolean => typeof v === 'number' || (typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v.trim())) || v instanceof Date || typeof v === 'boolean';

interface Block {
  /** 0-based index of the header row and of the last row of the table. */
  header: number;
  last: number;
  /** 0-based columns. */
  first: number;
  end: number;
}

/** The tables of a grid: a header row (2 or more text cells, none a number) with a row of data under it, and the rows under that look like data. */
function findBlocks(rows: RawCell[][]): Block[] {
  const count = (r: number, from: number, to: number): number => {
    let n = 0;
    for (let c = from; c <= to; c++) if (filled(rows[r]?.[c])) n++;
    return n;
  };
  const span = (r: number): { first: number; end: number } | undefined => {
    const row = rows[r] ?? [];
    let first = -1;
    let end = -1;
    row.forEach((v, c) => {
      if (filled(v)) {
        if (first < 0) first = c;
        end = c;
      }
    });
    return first < 0 ? undefined : { first, end };
  };
  const blocks: Block[] = [];
  let r = 0;
  while (r < rows.length - 1) {
    const s = span(r);
    const row = rows[r] ?? [];
    const cells = s ? row.slice(s.first, s.end + 1).filter((v) => filled(v)) : [];
    const headerLike = cells.length >= 2 && cells.every((v) => !numberLike(v));
    if (!s || !headerLike || count(r + 1, 0, 1000) < 2) {
      r++;
      continue;
    }
    const width = s.end - s.first + 1;
    const need = Math.max(2, Math.ceil(width / 3));
    let last = r;
    while (last + 1 < rows.length && count(last + 1, s.first, s.end) >= need) last++;
    if (last === r) {
      r++;
      continue;
    }
    blocks.push({ header: r, last, first: s.first, end: s.end });
    r = last + 1;
  }
  return blocks;
}

const startsWithWord = (text: string, words: readonly string[]): string | undefined => {
  const t = text.trimStart().toLowerCase();
  return words.find((w) => t.startsWith(w.trim().toLowerCase()) && (w.endsWith(' ') || w.endsWith(':') || t.length === w.trim().length || !/\p{L}/u.test(t[w.trim().length] ?? ' ')));
};

/**
 * Looks for the table in the cells of one sheet and proposes the region settings of an Input step. Rows and columns are
 * 1-based in the result, as in the file.
 */
export function analyzeLayout(grid: Grid, options: AnalyzeOptions = {}): LayoutAnalysis {
  const maxRows = options.maxRows ?? MAX_ANALYZE_ROWS;
  const maxColumns = options.maxColumns ?? MAX_ANALYZE_COLUMNS;
  const rows = grid.rows.slice(0, maxRows).map((r) => r.slice(0, maxColumns));
  const truncated = grid.truncated || grid.rows.length > maxRows || grid.rows.some((r) => r.length > maxColumns);
  const base = { columns: [] as string[], leftOut: {}, otherTables: [] as TableRegion[], rowsRead: rows.length, truncated };

  const blocks = findBlocks(rows);
  if (blocks.length === 0) return { ...base, found: false, noTable: { id: 'engine.layoutNoTable', params: {} } };

  const b = blocks[0]!;
  const many = blocks.length > 1;
  const headerRow = b.header + 1;
  const dataRows = b.last - b.header;
  // A row read from xlsx can have holes (cells that are not in the file), so it is indexed, not mapped.
  const headerCells: RawCell[] = Array.from({ length: b.end - b.first + 1 }, (_, i) => rows[b.header]![b.first + i] ?? null);
  const names = headerCells.map((v, i) => (filled(v) ? asText(v) : `Column ${b.first + i + 1}`));
  const clear = new Set(names.filter((_, i) => filled(headerCells[i]))).size === headerCells.filter(filled).length;
  const otherTables: TableRegion[] = blocks.slice(1).map((o) => ({ headerRow: o.header + 1, firstColumn: o.first + 1, lastColumn: o.end + 1, lastRow: o.last + 1 }));
  const where = { first: columnLetters(b.first + 1), last: columnLetters(b.end + 1) };

  // The header row.
  const filledNames = headerCells.filter(filled).length;
  const headerConfidence: Confidence = many ? 'low' : !clear ? 'medium' : dataRows < 2 ? 'medium' : 'high';
  const headerReason: Reason = many
    ? { id: 'engine.layoutHeaderMany', params: { n: blocks.length, row: headerRow } }
    : !clear
      ? { id: 'engine.layoutHeaderDuplicate', params: { row: headerRow } }
      : dataRows < 2
        ? { id: 'engine.layoutHeaderFew', params: { row: headerRow, rows: dataRows } }
        : { id: 'engine.layoutHeaderClear', params: { row: headerRow, n: filledNames } };
  const columnReason: Reason = many ? { id: 'engine.layoutColumnsMany', params: where } : { id: 'engine.layoutColumnsSpan', params: where };

  // Where the table stops: a footer word, a blank row with text after it, text that is not a table, or the end of the sheet.
  let stop: Proposed<StopRule>;
  const after = b.last + 1;
  let next = after;
  while (next < rows.length && !rows[next]!.some(filled)) next++;
  const hasMore = next < rows.length;
  const blankBetween = next > after;
  const footerCell = hasMore ? rows[next]!.findIndex((v) => filled(v) && startsWithWord(asText(v), FOOTER_WORDS) !== undefined) : -1;
  const columnOf = (c: number): string | undefined => (c >= b.first && c <= b.end ? names[c - b.first] : undefined);
  let where_: string;
  if (hasMore && footerCell >= 0) {
    const text = asText(rows[next]![footerCell]);
    const word = startsWithWord(text, FOOTER_WORDS)!.trim();
    const column = columnOf(footerCell);
    stop = { value: { kind: 'marker', text: word, match: 'starts_with', ...(column === undefined ? {} : { column }) }, confidence: 'high', reason: { id: 'engine.layoutStopMarker', params: { row: next + 1, text: word } } };
    where_ = `"${word}"`;
  } else if (hasMore && blankBetween) {
    stop = { value: { kind: 'blank_rows', count: 1 }, confidence: 'high', reason: { id: 'engine.layoutStopBlank', params: { row: after + 1 } } };
    where_ = `row ${after + 1}`;
  } else if (hasMore) {
    stop = { value: { kind: 'row', row: b.last + 1 }, confidence: 'medium', reason: { id: 'engine.layoutStopRow', params: { row: b.last + 1, next: after + 1 } } };
    where_ = `row ${b.last + 1}`;
  } else {
    stop = { value: { kind: 'end' }, confidence: 'low', reason: { id: 'engine.layoutStopEnd', params: {} } };
    where_ = 'the end of the sheet';
  }
  if (many) stop = { ...stop, confidence: 'low', reason: { id: 'engine.layoutStopMany', params: { where: where_ } } };

  // Total rows inside the table.
  const ignore: { column: string; text: string }[] = [];
  let ignoreReason: Reason | undefined;
  for (let r = b.header + 1; r <= b.last; r++) {
    for (let c = b.first; c <= b.end; c++) {
      const v = rows[r]![c];
      if (typeof v !== 'string') continue;
      const word = startsWithWord(v, TOTAL_WORDS);
      if (word === undefined) continue;
      const column = names[c - b.first]!;
      if (!ignore.some((i) => i.column === column && i.text === word)) {
        ignore.push({ column, text: word });
        ignoreReason ??= { id: 'engine.layoutIgnoreTotal', params: { row: r + 1, text: word, column } };
      }
    }
  }

  // Columns that look like merged cells: blank where the others are filled, and filled at the start.
  const fill: string[] = [];
  let fillReason: Reason | undefined;
  const body = rows.slice(b.header + 1, b.last + 1).filter((row) => !ignore.some((i) => row.some((v, c) => typeof v === 'string' && startsWithWord(v, [i.text]) !== undefined && names[c - b.first] === i.column)));
  names.forEach((name, i) => {
    const c = b.first + i;
    const values = body.map((row) => row[c]);
    const blanks = values.filter((v) => !filled(v) && body.length > 0).length;
    const others = (row: RawCell[]): boolean => row.slice(b.first, b.end + 1).filter(filled).length >= Math.ceil((b.end - b.first + 1) / 2);
    const gaps = body.filter((row) => !filled(row[c]) && others(row)).length;
    if (values.some(filled) && filled(values[0]) && gaps >= 2 && gaps / body.length >= 0.25 && blanks === gaps) {
      fill.push(name);
      fillReason ??= { id: 'engine.layoutFillMerged', params: { blank: gaps, rows: body.length, column: name } };
    }
  });

  // What is left out.
  const leftOut: LayoutAnalysis['leftOut'] = {};
  const firstText = rows.findIndex((r) => r.some(filled));
  let lastAbove = b.header - 1;
  while (lastAbove >= 0 && !rows[lastAbove]!.some(filled)) lastAbove--;
  if (firstText >= 0 && firstText < b.header && lastAbove >= firstText) leftOut.title = [firstText + 1, lastAbove + 1];
  let lastText = rows.length - 1;
  while (lastText > b.last && !rows[lastText]!.some(filled)) lastText--;
  if (lastText > b.last) leftOut.footer = [b.last + 2, lastText + 1];

  return {
    found: true,
    headerRow: { value: headerRow, confidence: headerConfidence, reason: headerReason },
    firstColumn: { value: b.first + 1, confidence: headerConfidence, reason: columnReason },
    lastColumn: { value: b.end + 1, confidence: headerConfidence, reason: columnReason },
    stopAt: stop,
    region: { headerRow, firstColumn: b.first + 1, lastColumn: b.end + 1, lastRow: b.last + 1 },
    expect: { value: names.filter((_, i) => filled(headerCells[i])), confidence: headerConfidence, reason: { id: 'engine.layoutExpectNames', params: {} } },
    ...(fill.length > 0 ? { fillDown: { value: fill, confidence: 'medium' as const, reason: fillReason! } } : {}),
    ...(ignore.length > 0 ? { ignoreRows: { value: ignore, confidence: 'medium' as const, reason: ignoreReason! } } : {}),
    columns: names,
    leftOut,
    otherTables,
    rowsRead: rows.length,
    truncated,
  };
}

/** The settings of an Input step that a proposal stands for, as they are saved (defaults are left out). */
export function proposalToSettings(a: LayoutAnalysis): Record<string, unknown> {
  if (!a.found) return {};
  const s: Record<string, unknown> = {};
  if (a.headerRow && a.headerRow.value !== 1) s.headerRow = a.headerRow.value;
  if (a.firstColumn && a.firstColumn.value !== 1) s.firstColumn = columnLetters(a.firstColumn.value);
  if (a.lastColumn) s.lastColumn = columnLetters(a.lastColumn.value);
  if (a.stopAt && a.stopAt.value.kind !== 'end') s.stopAt = a.stopAt.value;
  if (a.expect && a.expect.value.length > 0) s.expect = a.expect.value;
  if (a.fillDown) s.fillDown = a.fillDown.value;
  if (a.ignoreRows) s.ignoreRows = a.ignoreRows.value;
  return s;
}

export interface SheetCandidate {
  sheet: string;
  analysis: LayoutAnalysis;
}

/**
 * The sheet to read: the first sheet when it holds a table, else the sheet with the largest table (rows times columns, the
 * first of equal ones). Absent when no sheet holds a table.
 */
export function chooseSheet(candidates: SheetCandidate[]): Proposed<string> | undefined {
  const first = candidates[0];
  if (first?.analysis.found) return { value: first.sheet, confidence: 'high', reason: { id: 'engine.layoutSheetFirst', params: {} } };
  const size = (a: LayoutAnalysis): number => (a.region ? (a.region.lastColumn - a.region.firstColumn + 1) * (a.region.lastRow - a.region.headerRow + 1) : 0);
  let best: SheetCandidate | undefined;
  for (const c of candidates) if (c.analysis.found && (!best || size(c.analysis) > size(best.analysis))) best = c;
  if (!best) return undefined;
  const a = best.analysis;
  return { value: best.sheet, confidence: 'medium', reason: { id: 'engine.layoutSheetLargest', params: { sheet: best.sheet, rows: a.region!.lastRow - a.region!.headerRow, columns: a.region!.lastColumn - a.region!.firstColumn + 1 } } };
}
