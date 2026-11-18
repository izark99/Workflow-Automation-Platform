// Small xlsx parts: workbook, relationships, styles and shared strings.
import { XlsxReadError } from './errors';
import { textChunks, type ZipEntry } from './zip';

const ENTITY = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g;

export function unescapeXml(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(ENTITY, (_m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e] ?? '';
  });
}

export function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? unescapeXml(m[1]!) : undefined;
}

export interface SheetRef {
  name: string;
  path: string;
}

export function parseSheetList(workbookXml: string, relsXml: string): SheetRef[] {
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attr(m[1]!, 'Id');
    const target = attr(m[1]!, 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }
  const sheets: SheetRef[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const name = attr(m[1]!, 'name');
    const rid = attr(m[1]!, 'r:id');
    const path = rid ? targets.get(rid) : undefined;
    if (name && path) sheets.push({ name, path });
  }
  if (sheets.length === 0) throw new XlsxReadError('The workbook has no sheets. Check that the file is the right one.');
  return sheets;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormatCode(code: string): boolean {
  const stripped = code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
  return /[ymdhs]/i.test(stripped);
}

/** For each cell style index, whether the style formats the value as a date. */
export function parseDateStyles(stylesXml: string): boolean[] {
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b([^>]*?)\/?>/g)) {
    const id = Number(attr(m[1]!, 'numFmtId'));
    const code = attr(m[1]!, 'formatCode');
    if (Number.isInteger(id) && code !== undefined) custom.set(id, code);
  }
  const block = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? '';
  const result: boolean[] = [];
  for (const m of block.matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)) {
    const id = Number(attr(m[1]!, 'numFmtId') ?? 0);
    const code = custom.get(id);
    result.push(code !== undefined ? isDateFormatCode(code) : BUILTIN_DATE_FORMATS.has(id));
  }
  return result;
}

/** Shared strings, read as a stream because the part can be large. */
export async function readSharedStrings(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  let buf = '';
  const flush = (final: boolean) => {
    let pos = 0;
    for (;;) {
      const start = buf.indexOf('<si', pos);
      if (start < 0) break;
      const next = buf[start + 3];
      if (next !== '>' && next !== ' ' && next !== '/') {
        pos = start + 3;
        continue;
      }
      const gt = buf.indexOf('>', start);
      if (gt < 0) break;
      if (buf[gt - 1] === '/') {
        out.push('');
        pos = gt + 1;
        continue;
      }
      const end = buf.indexOf('</si>', gt);
      if (end < 0) break;
      const body = buf.slice(gt + 1, end).replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
      let text = '';
      for (const t of body.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) text += unescapeXml(t[1] ?? '');
      out.push(text);
      pos = end + 5;
    }
    buf = final ? '' : buf.slice(pos);
  };
  for await (const chunk of textChunks(stream)) {
    buf += chunk;
    flush(false);
  }
  flush(true);
  return out;
}

export function entryOrThrow(entries: Map<string, ZipEntry>, name: string): ZipEntry {
  const e = entries.get(name);
  if (!e) throw new XlsxReadError(`The file is missing the part ${name}, so it may be damaged. Open it in Excel, save it again, and retry.`);
  return e;
}
