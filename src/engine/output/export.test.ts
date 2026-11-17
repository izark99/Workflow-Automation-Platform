import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { FLOW_SCHEMA_VERSION } from '../flow/types';
import { runFlow, type RunResult } from '../run';
import { createNodeRunner } from '../runner/node-runner';
import { EngineError, type SqlRunner, type TableData } from '../types';
import { buildOutputFiles } from './export';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const data: TableData = {
  columns: [
    { name: 'Who', type: 'text' },
    { name: 'Day', type: 'number' },
    { name: 'When', type: 'date' },
    { name: 'Flag', type: 'boolean' },
    { name: 'Value', type: 'text' },
  ],
  rows: [
    ['a', 10, '2026-09-10', true, 'X'],
    ['b', 11, '2026-09-11', false, '2'],
    ['c', null, null, null, '2h'],
    ['d', 1.5, '2026-10-31', true, '007'],
    ['e', -3, '2026-01-01', false, '1.5'],
    ['f', 0.1 + 0.2, '1900-03-01', true, null],
    ['g', 4, '2026-09-30', true, ''],
  ],
};

const node = (id: string, settings: Record<string, unknown>) => ({ id, type: 'output', settings });
async function withRun<T>(nodes: unknown[], inputs: Record<string, TableData>, fn: (r: RunResult, flow: { nodes: never[] }) => Promise<T>): Promise<T> {
  const input = { id: 'in', type: 'input_file', settings: { key: 'k' } };
  const all = [input, ...nodes];
  const edges = (nodes as { id: string }[]).map((n) => ({ source: 'in', target: n.id }));
  const flow = { schemaVersion: FLOW_SCHEMA_VERSION, nodes: all, edges };
  const result = await runFlow(runner, { flow, effectiveDate: '2026-09-30', inputs: { k: inputs.k ?? data } });
  try {
    return await fn(result, flow as never);
  } finally {
    await result.dispose();
  }
}

const read = (bytes: Uint8Array, options: XLSX.ParsingOptions = {}) => XLSX.read(bytes, { type: 'array', cellNF: true, ...options });

describe('xlsx file', () => {
  it('writes the sheets of several Output steps into one workbook, in step order', async () => {
    await withRun(
      [node('o1', { file: 'Result', sheet: 'Second' }), node('o2', { file: 'Result', sheet: 'First' })],
      { k: data },
      async (result, flow) => {
        const files = await buildOutputFiles(result, flow);
        expect(files).toHaveLength(1);
        expect(files[0]).toMatchObject({ name: 'Result.xlsx', format: 'xlsx', sheets: ['Second', 'First'] });
        expect(read(files[0]!.bytes).SheetNames).toEqual(['Second', 'First']);
      },
    );
  });

  it('writes a header row, then typed cells: numbers, dates as serials with a date format, text, booleans', async () => {
    await withRun([node('o', { file: 'R', sheet: 'S' })], { k: data }, async (result, flow) => {
      const ws = read((await buildOutputFiles(result, flow))[0]!.bytes).Sheets.S!;
      expect(ws['!ref']).toBe('A1:E8');
      expect(['A1', 'B1', 'C1', 'D1', 'E1'].map((a) => ws[a]?.v)).toEqual(['Who', 'Day', 'When', 'Flag', 'Value']);
      expect(ws.A2).toMatchObject({ t: 's', v: 'a' });
      expect(ws.B2).toMatchObject({ t: 'n', v: 10 });
      expect(ws.C2).toMatchObject({ t: 'n', v: 46275, z: 'yyyy-mm-dd' });
      expect(ws.C5).toMatchObject({ t: 'n', v: 46326 });
      expect(ws.D2).toMatchObject({ t: 'b', v: true });
      expect(ws.D3).toMatchObject({ t: 'b', v: false });
      expect(ws.E2).toMatchObject({ t: 's', v: 'X' });
      expect(ws.B7.v).toBe(0.1 + 0.2);
    });
  });

  it('leaves a blank cell absent, not an empty text', async () => {
    await withRun([node('o', { file: 'R', sheet: 'S' })], { k: data }, async (result, flow) => {
      const ws = read((await buildOutputFiles(result, flow))[0]!.bytes).Sheets.S!;
      expect(ws.B4).toBeUndefined();
      expect(ws.C4).toBeUndefined();
      expect(ws.D4).toBeUndefined();
      expect(ws.E7).toBeUndefined();
      expect(ws.E8).toBeUndefined(); // an empty text is blank too
    });
  });

  it('reads back as a date for any time zone, because the date is a serial and not a JavaScript date', async () => {
    await withRun([node('o', { file: 'R', sheet: 'S' })], { k: data }, async (result, flow) => {
      const wb = read((await buildOutputFiles(result, flow))[0]!.bytes, { cellDates: true });
      const cell = wb.Sheets.S!.C2!;
      expect(cell.t).toBe('d');
      expect((cell.v as Date).toISOString()).toBe('2026-09-10T00:00:00.000Z');
    });
  });

  it('writes plain numbers in numberLikeText columns as numbers and keeps everything else text', async () => {
    await withRun([node('o', { file: 'R', sheet: 'S', numberLikeText: ['Value'] })], { k: data }, async (result, flow) => {
      const ws = read((await buildOutputFiles(result, flow))[0]!.bytes).Sheets.S!;
      expect(ws.E2).toMatchObject({ t: 's', v: 'X' });
      expect(ws.E3).toMatchObject({ t: 'n', v: 2 });
      expect(ws.E4).toMatchObject({ t: 's', v: '2h' });
      expect(ws.E5).toMatchObject({ t: 's', v: '007' });
      expect(ws.E6).toMatchObject({ t: 'n', v: 1.5 });
    });
  });

  it('keeps a text column as text when it is not listed', async () => {
    await withRun([node('o', { file: 'R', sheet: 'S' })], { k: data }, async (result, flow) => {
      expect(read((await buildOutputFiles(result, flow))[0]!.bytes).Sheets.S!.E3).toMatchObject({ t: 's', v: '2' });
    });
  });

  it('writes every row, not only the 100 of a preview', async () => {
    const big: TableData = { columns: [{ name: 'n', type: 'number' }], rows: Array.from({ length: 250 }, (_, i) => [i]) };
    await withRun([node('o', { file: 'R', sheet: 'S' })], { k: big }, async (result, flow) => {
      const ws = read((await buildOutputFiles(result, flow))[0]!.bytes).Sheets.S!;
      expect(ws['!ref']).toBe('A1:A251');
      expect(ws.A251!.v).toBe(249);
    });
  });
});

describe('csv file', () => {
  it('writes a csv with a byte order mark, quoting, ISO dates, TRUE and FALSE, and blanks', async () => {
    const tricky: TableData = {
      columns: [
        { name: 'Name, full', type: 'text' },
        { name: 'N', type: 'number' },
        { name: 'D', type: 'date' },
        { name: 'B', type: 'boolean' },
      ],
      rows: [
        ['a "q", b', 8, '2026-09-30', true],
        ['line\nbreak', 1.5, null, false],
        [null, null, '2026-01-02', null],
        ['Nguyễn', -2, '2026-10-31', true],
      ],
    };
    await withRun([node('o', { file: 'Flat', format: 'csv' })], { k: tricky }, async (result, flow) => {
      const files = await buildOutputFiles(result, flow);
      expect(files[0]).toMatchObject({ name: 'Flat.csv', format: 'csv', sheets: [] });
      const bytes = files[0]!.bytes;
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const text = new TextDecoder().decode(bytes.slice(3));
      expect(text).toBe(
        '"Name, full",N,D,B\r\n"a ""q"", b",8,2026-09-30,TRUE\r\n"line\nbreak",1.5,,FALSE\r\n,,2026-01-02,\r\nNguyễn,-2,2026-10-31,TRUE\r\n',
      );
    });
  });

  it('writes csv and xlsx files from one run, in order of first appearance', async () => {
    await withRun(
      [node('o1', { file: 'Flat', format: 'csv' }), node('o2', { file: 'Book', sheet: 'S' })],
      { k: data },
      async (result, flow) => {
        expect((await buildOutputFiles(result, flow)).map((f) => f.name)).toEqual(['Flat.csv', 'Book.xlsx']);
      },
    );
  });
});

describe('mistakes', () => {
  it('says when the flow has no Output step', async () => {
    await withRun([], { k: data }, async (result, flow) => {
      const err = await buildOutputFiles(result, flow).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EngineError);
      expect((err as EngineError).message).toMatch(/no Output step/);
      expect((err as EngineError).message).toMatch(/Add an Output step/);
    });
  });

  it('makes a safe file name from the file key', async () => {
    await withRun([node('o', { file: 'a/b:c?', sheet: 'S' })], { k: data }, async (result, flow) => {
      expect((await buildOutputFiles(result, flow))[0]!.name).toBe('a_b_c_.xlsx');
    });
  });
});
