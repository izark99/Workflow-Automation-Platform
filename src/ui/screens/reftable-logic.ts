// Pure part of the Reference tables screen: summaries, the grid as text, paste from Excel, pages.
import type { Cell, Column, ColumnType } from '../../engine/types';
import { isIsoDate } from '../../engine/versions';
import { referencedTables } from '../../engine/versions';
import { MAX_REF_ROWS } from '../../store/types';
import type { FlowRecord, RefTableRecord, RefTableVersionRecord } from '../../store/types';
import { formatCell } from '../builder/preview-logic';
import { translate } from '../i18n';

/** The published version that covers `today`, or undefined. */
export function versionInEffect(t: RefTableRecord, today: string): RefTableVersionRecord | undefined {
  return t.versions.find((v) => v.status === 'published' && v.validFrom <= today && (v.validTo === null || today <= v.validTo));
}

/** The version the list shows rows for: the one in effect, else the newest. */
export const versionToShow = (t: RefTableRecord, today: string): RefTableVersionRecord | undefined =>
  versionInEffect(t, today) ?? [...t.versions].sort((a, b) => b.versionNo - a.versionNo)[0];

/** `8 rows, v2 in effect`, or `4 rows, v1 (not in effect)` when no published version covers today. */
export function tableSummary(t: RefTableRecord, today: string): string {
  const inEffect = versionInEffect(t, today);
  const v = inEffect ?? versionToShow(t, today);
  if (!v) return translate('refTables.noVersion');
  const rows = translate('refTables.rowCount', { count: v.rows.length, countText: v.rows.length.toLocaleString('en-US') });
  const key = inEffect ? 'refTables.summary.inEffect' : v.status === 'draft' ? 'refTables.summary.draft' : 'refTables.summary.notInEffect';
  return translate(key, { rows, n: v.versionNo });
}

/** The flows that read the table, by name (any of their versions). */
export function usedBy(flows: FlowRecord[], tableName: string): string[] {
  return flows.filter((f) => f.versions.some((v) => referencedTables(v.definition).includes(tableName))).map((f) => f.name);
}

// ---- The grid as text, so an edit is never lost to a failed parse

export const rowsToText = (rows: Cell[][], columns: Column[]): string[][] => rows.map((r) => columns.map((c, i) => formatCellEditable(r[i] ?? null, c.type)));

const formatCellEditable = (v: Cell, type: ColumnType): string => (v === null ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : type === 'date' && typeof v === 'string' ? v : String(v));

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)$/;

export type CellParse = { ok: true; value: Cell } | { ok: false; message: string };

/** One cell from text, by column type. Empty is blank. Dates are written 2026-09-30. */
export function parseCell(text: string, column: Column): CellParse {
  const t = text.trim();
  if (t === '') return { ok: true, value: null };
  switch (column.type) {
    case 'number':
      return NUMBER.test(t) ? { ok: true, value: Number(t) } : { ok: false, message: translate('refTables.error.number', { value: t }) };
    case 'date':
      return isIsoDate(t) ? { ok: true, value: t } : { ok: false, message: translate('refTables.error.date', { value: t }) };
    case 'boolean': {
      const l = t.toLowerCase();
      if (['yes', 'true', '1'].includes(l)) return { ok: true, value: true };
      if (['no', 'false', '0'].includes(l)) return { ok: true, value: false };
      return { ok: false, message: translate('refTables.error.boolean', { value: t }) };
    }
    default:
      return { ok: true, value: text };
  }
}

export interface RowErrors {
  row: number;
  column: string;
  message: string;
}

/** All rows from text. Errors name the row (1-based) and the column, so they can be found in a long table. */
export function textToRows(text: string[][], columns: Column[]): { rows: Cell[][]; errors: RowErrors[] } {
  const rows: Cell[][] = [];
  const errors: RowErrors[] = [];
  text.forEach((r, ri) => {
    rows.push(
      columns.map((c, ci) => {
        const p = parseCell(r[ci] ?? '', c);
        if (!p.ok) {
          errors.push({ row: ri + 1, column: c.name, message: p.message });
          return null;
        }
        return p.value;
      }),
    );
  });
  return { rows, errors };
}

export const tooManyRows = (n: number): string | undefined =>
  n > MAX_REF_ROWS ? translate('refTables.error.tooManyRows', { max: MAX_REF_ROWS.toLocaleString('en-US'), n: n.toLocaleString('en-US') }) : undefined;

// ---- Paste from Excel

const splitLines = (text: string): string[][] => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  return lines.map((l) => l.split('\t'));
};

/** Cells copied from Excel, as typed: lines and tab separated cells, with no header detection. For a paste at a cell. */
export const pastedCells = (text: string): string[][] => splitLines(text);

/** Puts pasted cells into the grid with the first one at (row, col); rows are added at the end when the paste is longer, extra cells to the right are dropped. */
export function pasteAt(grid: string[][], columns: number, row: number, col: number, cells: string[][]): string[][] {
  const next = grid.map((r) => [...r]);
  cells.forEach((line, i) => {
    const r = row + i;
    while (next.length <= r) next.push(Array.from({ length: columns }, () => ''));
    line.forEach((cell, j) => {
      if (col + j < columns) next[r]![col + j] = cell;
    });
  });
  return next;
}

export type PasteRows = { ok: true; rows: string[][] } | { ok: false; message: string };

/**
 * Cells copied from Excel for a table with known columns. A first line that holds the column names (any case) is a header and is
 * skipped. A line with more cells than the table has columns is refused, so no value is dropped without a word.
 */
export function pasteIntoGrid(text: string, columns: Column[]): PasteRows {
  const lines = splitLines(text);
  if (lines.length === 0) return { ok: false, message: translate('refTables.error.pasteEmptyCells') };
  const names = columns.map((c) => c.name.toLowerCase());
  const first = lines[0]!.map((c) => c.trim().toLowerCase());
  const header = first.length > 0 && first.every((c) => names.includes(c)) && first.length <= names.length && first.some((c) => c !== '');
  const body = header ? lines.slice(1) : lines;
  if (body.length === 0) return { ok: false, message: translate('refTables.error.pasteNoRows') };
  // With a header, the cells are placed by column name; without one, by position.
  const place = header ? first.map((h) => names.indexOf(h)) : lines[0]!.map((_, i) => i);
  const rows: string[][] = [];
  for (let i = 0; i < body.length; i++) {
    const cells = body[i]!;
    if (!header && cells.length > columns.length) {
      return { ok: false, message: translate('refTables.error.pasteWidth', { n: i + 1, cells: cells.length, columns: columns.length }) };
    }
    const row = columns.map(() => '');
    cells.forEach((cell, ci) => {
      const target = header ? place[ci] : ci;
      if (target !== undefined && target >= 0) row[target] = cell;
    });
    rows.push(row);
  }
  return { ok: true, rows };
}

/** True for text that has more than one cell or line, which is what a copy from Excel looks like. */
export const looksLikeGrid = (text: string): boolean => /[\t\n]/.test(text.replace(/\n+$/, ''));

export type NewTable = { ok: true; columns: Column[]; rows: Cell[][] } | { ok: false; message: string };

/** A whole table from Excel for "New table": the first line is the header, types follow the values (number, date, else text). */
export function newTableFromPaste(text: string): NewTable {
  const lines = splitLines(text);
  if (lines.length === 0) return { ok: false, message: translate('refTables.error.tableEmpty') };
  const names = lines[0]!.map((c) => c.trim());
  if (names.some((n) => n === '')) return { ok: false, message: translate('refTables.error.headerEmptyCell') };
  const lower = names.map((n) => n.toLowerCase());
  const dup = names.find((_, i) => lower.indexOf(lower[i]!) !== i);
  if (dup) return { ok: false, message: translate('refTables.error.headerDuplicate', { name: dup }) };
  const body = lines.slice(1);
  for (let i = 0; i < body.length; i++) {
    if (body[i]!.length > names.length) return { ok: false, message: translate('refTables.error.rowWidth', { n: i + 1, cells: body[i]!.length, columns: names.length }) };
  }
  const columns: Column[] = names.map((name, ci) => {
    const values = body.map((r) => (r[ci] ?? '').trim()).filter((v) => v !== '');
    const type: ColumnType = values.length > 0 && values.every((v) => NUMBER.test(v)) ? 'number' : values.length > 0 && values.every((v) => isIsoDate(v)) ? 'date' : 'text';
    return { name, type };
  });
  const parsed = textToRows(body.map((r) => columns.map((_, ci) => r[ci] ?? '')), columns);
  return { ok: true, columns, rows: parsed.rows };
}

// ---- Pages of a long grid

export const PAGE_SIZE = 100;

export function pageRange(total: number, page: number, size = PAGE_SIZE): { from: number; to: number; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { from: p * size, to: Math.min(total, (p + 1) * size), pages, page: p };
}

export { formatCell };
