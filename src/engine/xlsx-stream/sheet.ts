// Row-by-row reader of a worksheet part. Works on text chunks, so a 1.5 GB sheet
// is never held as one string.
import { attr, unescapeXml } from './parts';

export type CellValue = string | number | boolean | Date | undefined;

export interface XlsxRow {
  /** Excel row number, starting at 1. Rows without cells are reported with an empty list. */
  row: number;
  cells: CellValue[];
}

export interface SheetContext {
  sharedStrings: string[];
  /** Per style index: true when the style formats a number as a date. */
  dateStyles: boolean[];
}

const SERIAL_TO_UNIX_DAYS = 25569;

export function columnIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function cellValue(type: string | undefined, style: string | undefined, body: string, ctx: SheetContext): CellValue {
  if (type === 'inlineStr') {
    const is = /<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '';
    let text = '';
    for (const t of is.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) text += unescapeXml(t[1] ?? '');
    return text;
  }
  const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
  if (v === undefined) return undefined;
  switch (type) {
    case 's':
      return ctx.sharedStrings[Number(v)];
    case 'str':
    case 'e':
      return unescapeXml(v);
    case 'b':
      return v === '1';
    case 'd':
      return new Date(v);
    default: {
      const n = Number(v);
      if (Number.isNaN(n)) return unescapeXml(v);
      if (style !== undefined && ctx.dateStyles[Number(style)]) {
        return new Date(Math.round((n - SERIAL_TO_UNIX_DAYS) * 86_400_000));
      }
      return n;
    }
  }
}

function parseRow(rowNumber: number, body: string, ctx: SheetContext): XlsxRow {
  const cells: CellValue[] = [];
  let next = 0;
  for (const m of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1]!;
    const ref = attr(attrs, 'r');
    const col = ref ? columnIndex(ref) : next;
    next = col + 1;
    const value = cellValue(attr(attrs, 't'), attr(attrs, 's'), m[2] ?? '', ctx);
    if (value !== undefined) cells[col] = value;
  }
  return { row: rowNumber, cells };
}

export async function* parseSheetRows(chunks: AsyncIterable<string>, ctx: SheetContext): AsyncGenerator<XlsxRow> {
  let buf = '';
  let lastRow = 0;
  for await (const chunk of chunks) {
    buf += chunk;
    let pos = 0;
    for (;;) {
      const start = buf.indexOf('<row', pos);
      if (start < 0) {
        // Keep a few characters, since "<row" may be split across chunks.
        pos = Math.max(pos, buf.length - 3);
        break;
      }
      const after = buf[start + 4];
      if (after === undefined) {
        pos = start;
        break;
      }
      if (after !== ' ' && after !== '>' && after !== '/') {
        pos = start + 4;
        continue;
      }
      const gt = buf.indexOf('>', start);
      if (gt < 0) {
        pos = start;
        break;
      }
      const attrs = buf.slice(start + 4, gt);
      const rowNumber = Number(attr(attrs, 'r') ?? lastRow + 1);
      if (buf[gt - 1] === '/') {
        lastRow = rowNumber;
        yield { row: rowNumber, cells: [] };
        pos = gt + 1;
        continue;
      }
      const end = buf.indexOf('</row>', gt);
      if (end < 0) {
        pos = start;
        break;
      }
      lastRow = rowNumber;
      yield parseRow(rowNumber, buf.slice(gt + 1, end), ctx);
      pos = end + 6;
    }
    buf = buf.slice(pos);
  }
}
