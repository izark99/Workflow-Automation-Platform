// Benchmark file generator helpers (task T0.2). Streams to disk so that a
// 1,048,576 x 40 sheet (about 42 million cells) never sits in memory.
import { createWriteStream, createReadStream } from 'node:fs';
import { open, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { crc32, createDeflateRaw } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { Writable } from 'node:stream';

export const COLUMN_COUNT = 40;
export const STRING_POOL_SIZE = 2000;
export const GROUP_KEY_COUNT = 200;
const DATE_BASE_SERIAL = 45000; // Excel serial date, 2023-03-15
const NUM_COLUMNS = 10;

export type Cell =
  | { kind: 'num'; value: number }
  | { kind: 'date'; value: number }
  | { kind: 'str'; index: number };

/** Small seeded generator (mulberry32), so every run writes identical files. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function columnLetter(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function headerNames(): string[] {
  const names = ['id', 'group_key', 'event_date'];
  for (let i = 1; i <= NUM_COLUMNS; i++) names.push(`num_${i}`);
  const textCount = COLUMN_COUNT - names.length;
  for (let i = 1; i <= textCount; i++) names.push(`text_${i}`);
  return names;
}

/** Text of pool entry i. Some entries hold a comma so csv quoting is exercised. */
export function poolString(i: number): string {
  return i % 50 === 0 ? `Item, ${i}` : `Item ${i}`;
}

/** One data row: id, a group key with 200 values, a date, 10 numbers, 27 texts. */
export function makeRow(rng: () => number, id: number): Cell[] {
  const cells: Cell[] = [
    { kind: 'num', value: id },
    { kind: 'str', index: Math.floor(rng() * GROUP_KEY_COUNT) },
    { kind: 'date', value: DATE_BASE_SERIAL + Math.floor(rng() * 365) },
  ];
  for (let i = 0; i < NUM_COLUMNS; i++) {
    cells.push({ kind: 'num', value: Math.round(rng() * 1_000_000) / 100 });
  }
  while (cells.length < COLUMN_COUNT) {
    cells.push({ kind: 'str', index: Math.floor(rng() * STRING_POOL_SIZE) });
  }
  return cells;
}

export function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

export function csvRow(values: string[]): string {
  return values.map(csvEscape).join(',') + '\n';
}

function serialToIso(serial: number): string {
  return new Date((serial - 25569) * 86400000).toISOString().slice(0, 10);
}

function cellToCsv(c: Cell): string {
  if (c.kind === 'str') return poolString(c.index);
  if (c.kind === 'date') return serialToIso(c.value);
  return String(c.value);
}

type Write = (chunk: string) => Promise<void>;

function writerFor(stream: Writable): Write {
  return async (chunk) => {
    if (!stream.write(chunk)) await once(stream, 'drain');
  };
}

/** `totalRows` counts the header row, so 1_048_576 is the Excel limit. */
export async function writeCsv(path: string, totalRows: number, seed = 1): Promise<void> {
  const out = createWriteStream(path);
  const write = writerFor(out);
  const rng = makeRng(seed);
  await write(csvRow(headerNames()));
  let buf = '';
  for (let r = 1; r < totalRows; r++) {
    buf += csvRow(makeRow(rng, r).map(cellToCsv));
    if (r % 2000 === 0) {
      await write(buf);
      buf = '';
    }
  }
  if (buf) await write(buf);
  out.end();
  await once(out, 'finish');
}

function xmlEscape(v: string): string {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function smallParts(): Record<string, string> {
  return {
    '[Content_Types].xml':
      XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '</Types>',
    '_rels/.rels':
      XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml':
      XML_HEAD +
      `<workbook xmlns="${NS}" xmlns:r="${REL_NS}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
      '</Relationships>',
    // Style 1 is the built-in date format 14 (m/d/yyyy).
    'xl/styles.xml':
      XML_HEAD +
      `<styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
      '</styleSheet>',
  };
}

/** Shared strings: headers first, then the pool, as Excel stores repeated text. */
function sharedStringsXml(): { xml: string; headerBase: number; poolBase: number } {
  const headers = headerNames();
  const items: string[] = [];
  for (const h of headers) items.push(h);
  for (let i = 0; i < STRING_POOL_SIZE; i++) items.push(poolString(i));
  const body = items.map((s) => `<si><t>${xmlEscape(s)}</t></si>`).join('');
  return {
    xml: XML_HEAD + `<sst xmlns="${NS}" count="${items.length}" uniqueCount="${items.length}">${body}</sst>`,
    headerBase: 0,
    poolBase: headers.length,
  };
}

interface PartInfo {
  name: string;
  tmpPath: string;
  crc: number;
  size: number;
  csize: number;
  offset: number;
}

/** Deflate a produced stream of text into a temp file, tracking CRC and sizes. */
async function deflatePart(
  name: string,
  tmpPath: string,
  produce: (write: Write) => Promise<void>,
): Promise<PartInfo> {
  const deflate = createDeflateRaw({ level: 1 });
  const file = createWriteStream(tmpPath);
  const done = pipeline(deflate, file);
  let crc = 0;
  let size = 0;
  const write = writerFor(deflate);
  await produce(async (chunk) => {
    const buf = Buffer.from(chunk, 'utf8');
    crc = crc32(buf, crc);
    size += buf.length;
    await write(chunk);
  });
  deflate.end();
  await done;
  const { size: csize } = await stat(tmpPath);
  return { name, tmpPath, crc, size, csize, offset: 0 };
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

/** Zip with deflate entries. Uses zip64 fields only when a size needs them. */
async function assembleZip(zipPath: string, parts: PartInfo[]): Promise<void> {
  const fh = await open(zipPath, 'w');
  let pos = 0;
  const writeBuf = async (b: Buffer) => {
    await fh.write(b);
    pos += b.length;
  };
  for (const p of parts) {
    p.offset = pos;
    const nameBuf = Buffer.from(p.name, 'utf8');
    const big = p.size >= 0xffffffff || p.csize >= 0xffffffff;
    const extra = big
      ? Buffer.concat([u16(1), u16(16), Buffer.from(bigint64(p.size)), Buffer.from(bigint64(p.csize))])
      : Buffer.alloc(0);
    await writeBuf(
      Buffer.concat([
        u32(0x04034b50), u16(big ? 45 : 20), u16(0), u16(8), u16(0), u16(0x21),
        u32(p.crc), u32(big ? 0xffffffff : p.csize), u32(big ? 0xffffffff : p.size),
        u16(nameBuf.length), u16(extra.length), nameBuf, extra,
      ]),
    );
    const rs = createReadStream(p.tmpPath);
    for await (const chunk of rs) await writeBuf(chunk as Buffer);
  }
  const cdStart = pos;
  for (const p of parts) {
    const nameBuf = Buffer.from(p.name, 'utf8');
    const big = p.size >= 0xffffffff || p.csize >= 0xffffffff;
    const extra = big
      ? Buffer.concat([u16(1), u16(16), Buffer.from(bigint64(p.size)), Buffer.from(bigint64(p.csize))])
      : Buffer.alloc(0);
    await writeBuf(
      Buffer.concat([
        u32(0x02014b50), u16(big ? 45 : 20), u16(big ? 45 : 20), u16(0), u16(8), u16(0), u16(0x21),
        u32(p.crc), u32(big ? 0xffffffff : p.csize), u32(big ? 0xffffffff : p.size),
        u16(nameBuf.length), u16(extra.length), u16(0), u16(0), u16(0), u32(0), u32(p.offset),
        nameBuf, extra,
      ]),
    );
  }
  const cdSize = pos - cdStart;
  await writeBuf(
    Buffer.concat([
      u32(0x06054b50), u16(0), u16(0), u16(parts.length), u16(parts.length),
      u32(cdSize), u32(cdStart), u16(0),
    ]),
  );
  await fh.close();
}

function bigint64(n: number): Uint8Array {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

/** Streamed xlsx writer. `totalRows` counts the header row. */
export async function writeXlsx(path: string, totalRows: number, seed = 1): Promise<void> {
  const tmp = `${path}.parts`;
  const parts: PartInfo[] = [];
  const small = smallParts();
  const ss = sharedStringsXml();
  const staged: [string, string][] = [...Object.entries(small), ['xl/sharedStrings.xml', ss.xml]];
  for (const [n, [name, xml]] of staged.entries()) {
    parts.push(await deflatePart(name, `${tmp}.${n}`, (w) => w(xml)));
  }
  const lastCol = columnLetter(COLUMN_COUNT - 1);
  parts.push(
    await deflatePart('xl/worksheets/sheet1.xml', `${tmp}.sheet`, async (write) => {
      await write(
        XML_HEAD +
          `<worksheet xmlns="${NS}"><dimension ref="A1:${lastCol}${totalRows}"/><sheetData>`,
      );
      const letters = Array.from({ length: COLUMN_COUNT }, (_, i) => columnLetter(i));
      const header = headerNames()
        .map((_, i) => `<c r="${letters[i]}1" t="s"><v>${ss.headerBase + i}</v></c>`)
        .join('');
      await write(`<row r="1">${header}</row>`);
      const rng = makeRng(seed);
      let buf = '';
      for (let r = 1; r < totalRows; r++) {
        const rowNo = r + 1;
        let row = `<row r="${rowNo}">`;
        const cells = makeRow(rng, r);
        for (let c = 0; c < COLUMN_COUNT; c++) {
          const cell = cells[c]!;
          const ref = `${letters[c]}${rowNo}`;
          if (cell.kind === 'str') row += `<c r="${ref}" t="s"><v>${ss.poolBase + cell.index}</v></c>`;
          else if (cell.kind === 'date') row += `<c r="${ref}" s="1"><v>${cell.value}</v></c>`;
          else row += `<c r="${ref}"><v>${cell.value}</v></c>`;
        }
        buf += row + '</row>';
        if (r % 1000 === 0) {
          await write(buf);
          buf = '';
        }
      }
      if (buf) await write(buf);
      await write('</sheetData></worksheet>');
    }),
  );
  await assembleZip(path, parts);
  for (const p of parts) await rm(p.tmpPath, { force: true });
}

export interface BenchFileSpec {
  name: string;
  format: 'xlsx' | 'csv';
  totalRows: number;
}

/** The six files of SPEC section 8. 1,048,576 is the Excel row limit, header included. */
export const BENCH_SIZES = [100_000, 500_000, 1_048_576] as const;

export function benchFileSpecs(): BenchFileSpec[] {
  const specs: BenchFileSpec[] = [];
  for (const rows of BENCH_SIZES) {
    for (const format of ['xlsx', 'csv'] as const) {
      specs.push({ name: `rows-${rows}.${format}`, format, totalRows: rows });
    }
  }
  return specs;
}
