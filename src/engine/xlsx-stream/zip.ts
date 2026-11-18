// Minimal zip reader for xlsx files. It reads the central directory with small slices
// and streams one entry at a time, so a 300 MB file never sits in memory.
import { SAVE_AS_HINT, XlsxReadError } from './errors';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  headerOffset: number;
}

async function readBytes(blob: Blob, start: number, end: number): Promise<DataView> {
  const buf = await blob.slice(start, end).arrayBuffer();
  return new DataView(buf);
}

const NOT_ZIP = `This file is not a valid .xlsx file (no zip header found). ${SAVE_AS_HINT}`;

export async function readZipDirectory(blob: Blob): Promise<Map<string, ZipEntry>> {
  const tailLen = Math.min(blob.size, 22 + 65535);
  const tail = await readBytes(blob, blob.size - tailLen, blob.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxReadError(NOT_ZIP);
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) {
    throw new XlsxReadError(`This file uses a zip format that is not supported (zip64). Save the sheet as .csv and try again.`);
  }
  const cd = await readBytes(blob, cdOffset, cdOffset + cdSize);
  const names = new TextDecoder('utf-8');
  const entries = new Map<string, ZipEntry>();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== 0x02014b50) throw new XlsxReadError(NOT_ZIP);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const entry: ZipEntry = {
      method: cd.getUint16(p + 10, true),
      compressedSize: cd.getUint32(p + 20, true),
      size: cd.getUint32(p + 24, true),
      headerOffset: cd.getUint32(p + 42, true),
      name: names.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen)),
    };
    if (entry.compressedSize === 0xffffffff || entry.size === 0xffffffff || entry.headerOffset === 0xffffffff) {
      throw new XlsxReadError(`The part ${entry.name} is too large for this reader. Save the sheet as .csv and try again.`);
    }
    entries.set(entry.name, entry);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Stream of the uncompressed bytes of one entry. */
export async function openEntry(blob: Blob, entry: ZipEntry): Promise<ReadableStream<Uint8Array>> {
  const head = await readBytes(blob, entry.headerOffset, entry.headerOffset + 30);
  if (head.getUint32(0, true) !== 0x04034b50) throw new XlsxReadError(NOT_ZIP);
  const start = entry.headerOffset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  const raw = blob.slice(start, start + entry.compressedSize).stream() as ReadableStream<Uint8Array>;
  if (entry.method === 0) return raw;
  if (entry.method === 8) {
    return raw.pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  }
  throw new XlsxReadError(`The part ${entry.name} uses an unsupported compression method (${entry.method}). ${SAVE_AS_HINT}`);
}

/** Decode a byte stream to text chunks. Multi-byte characters may span chunks, so decode in stream mode. */
export async function* textChunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8');
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const rest = decoder.decode();
    if (rest) yield rest;
  } finally {
    reader.releaseLock();
  }
}

export async function readEntryText(blob: Blob, entry: ZipEntry): Promise<string> {
  let out = '';
  for await (const chunk of textChunks(await openEntry(blob, entry))) out += chunk;
  return out;
}
