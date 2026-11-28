import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import type { RunResult } from '../run';
import type { TableData } from '../types';
import { readEntryText, readZipDirectory } from '../xlsx-stream/zip';
import { buildOutputFiles } from './export';
import { MAX_PRINT_ROWS } from './print/settings';

const table: TableData = {
  columns: [
    { name: 'Id', type: 'text' },
    { name: 'Hours', type: 'number' },
    { name: 'Day', type: 'date' },
    { name: 'Ok', type: 'boolean' },
  ],
  rows: [
    ['007', 8.5, '2026-09-01', true],
    ['x', null, null, false],
  ],
};
const resultOf = (tables: Record<string, TableData>): RunResult => ({ rows: async (id: string) => tables[id] ?? table }) as unknown as RunResult;
const out = (id: string, settings: Record<string, unknown>) => ({ id, type: 'output', settings: { file: 'R', format: 'xlsx', sheet: 'S', ...settings } });
const flowOf = (...nodes: ReturnType<typeof out>[]) => ({ nodes }) as never;
const print = { enabled: true, header: [{ text: 'REPORT {flow}', align: 'center', bold: true, size: 'large' }], signers: [{ title: 'Maker', line: '', name: '' }] };

async function entry(bytes: Uint8Array, name: string): Promise<string> {
  const blob = new Blob([bytes as BlobPart]);
  const dir = await readZipDirectory(blob);
  return readEntryText(blob, dir.get(name)!);
}

describe('the output with a print layout', () => {
  it('a flow with no layout is written by the normal path, byte for byte as before (sha-256 of the file of the version before Phase 9)', async () => {
    const [file] = await buildOutputFiles(resultOf({}), flowOf(out('o', { numberLikeText: ['Id'] })));
    expect(createHash('sha256').update(file!.bytes).digest('hex')).toBe('d70178f74ac5cb88e2289f652fc3e4d68a9c8d5332656884ad33b0d11f2c2be0');
  });

  it('a layout that is switched off is the normal path too', async () => {
    const [plain] = await buildOutputFiles(resultOf({}), flowOf(out('o', { numberLikeText: ['Id'] })));
    const [off] = await buildOutputFiles(resultOf({}), flowOf(out('o', { numberLikeText: ['Id'], print: { ...print, enabled: false } })));
    expect(Buffer.from(off!.bytes).equals(Buffer.from(plain!.bytes))).toBe(true);
    expect(off!.printed).toBeUndefined();
  });

  it('a layout is written with the print writer: the lines, the table and the signers are in the file, with the tokens replaced', async () => {
    const [file] = await buildOutputFiles(resultOf({}), flowOf(out('o', { print })), { flowName: 'Timesheet', runDate: '2026-10-05', effectiveDate: '2026-09-30' });
    const ws = XLSX.read(file!.bytes, { type: 'array' }).Sheets.S!;
    expect(ws.A1!.v).toBe('REPORT Timesheet');
    expect(ws.A3!.v).toBe('Id');
    expect(ws.A4!.v).toBe('007');
    expect(file!.sheets).toEqual(['S']);
    expect(file!.printed).toBe(true);
    expect(await entry(file!.bytes, 'xl/worksheets/sheet1.xml')).toContain('Trang');
  });

  it('each sheet has its own layout and a sheet without one is a plain table', async () => {
    const [file] = await buildOutputFiles(resultOf({}), flowOf(out('a', { sheet: 'One', print }), out('b', { sheet: 'Two' })));
    const wb = XLSX.read(file!.bytes, { type: 'array' });
    expect(wb.SheetNames).toEqual(['One', 'Two']);
    expect(wb.Sheets.One!.A1!.v).toBe('REPORT ');
    expect(wb.Sheets.Two!.A1!.v).toBe('Id');
    expect(await entry(file!.bytes, 'xl/worksheets/sheet2.xml')).not.toContain('oddFooter');
  });

  it('refuses a table over the row limit with a message that says what to do, and only for a sheet that has the layout', async () => {
    const big: TableData = { columns: [{ name: 'Id', type: 'text' }], rows: Array.from({ length: MAX_PRINT_ROWS + 1 }, (_, i) => [`r${i}`]) };
    await expect(buildOutputFiles(resultOf({ o: big }), flowOf(out('o', { print })))).rejects.toThrow(/20,001 rows.*up to 20,000.*Turn the print layout off/);
    const [file] = await buildOutputFiles(resultOf({ o: big }), flowOf(out('o', { print: { ...print, enabled: false } })));
    expect(file!.bytes.length).toBeGreaterThan(1000);
  });

  it('ignores the layout for csv', async () => {
    const [plain] = await buildOutputFiles(resultOf({}), flowOf(out('o', { format: 'csv' })));
    const [csv] = await buildOutputFiles(resultOf({}), flowOf(out('o', { format: 'csv', print })));
    expect(Buffer.from(csv!.bytes).equals(Buffer.from(plain!.bytes))).toBe(true);
  });
});
