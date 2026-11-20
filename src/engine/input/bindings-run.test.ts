import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { runFlow } from '../run';
import { createNodeRunner } from '../runner/node-runner';
import type { EngineError, SqlRunner } from '../types';
import type { FileSource } from './load';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

function xlsxFile(sheets: Record<string, unknown[][]>): FileSource {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer]);
  return { name: 'a.xlsx', size: blob.size, blob };
}
const csvFile = (text: string): FileSource => {
  const blob = new Blob([text]);
  return { name: 'a.csv', size: blob.size, blob };
};

const flow = {
  schemaVersion: 3,
  parameters: [
    { key: 'sheet', label: 'Sheet', type: 'text', required: true },
    { key: 'header', label: 'Header row', type: 'number', required: true, default: 1 },
  ],
  nodes: [{ id: 'in', type: 'input_file', settings: { key: 'Main', sheet: { $param: 'sheet' }, headerRow: { $param: 'header' } } }],
  edges: [],
};

async function rows(file: FileSource, values: Record<string, string | number>) {
  const result = await runFlow(runner, { flow, effectiveDate: '2026-09-30', files: { Main: file }, parameterValues: values });
  try {
    return await result.preview('in');
  } finally {
    await result.dispose();
  }
}

describe('an Input step whose sheet and header row come from parameters', () => {
  const file = xlsxFile({ June: [['x'], ['wrong']], July: [['title'], ['Name', 'Hours'], ['a', 1]] });
  it('reads the sheet and the header row that the parameters name (xlsx)', async () => {
    const t = await rows(file, { sheet: 'July', header: 2 });
    expect(t.columns.map((c) => c.name)).toEqual(['Name', 'Hours']);
    expect(t.rows).toEqual([['a', 1]]);
  });
  it('another value gives another table', async () => {
    const t = await rows(file, { sheet: 'June', header: 1 });
    expect(t.columns.map((c) => c.name)).toEqual(['x']);
    expect(t.rows).toEqual([['wrong']]);
  });
  it('reads a csv with the header row from the parameter (a csv has no sheets, so the sheet value is not used)', async () => {
    const t = await rows(csvFile('title\nName,Hours\na,1\n'), { sheet: 'ignored', header: 2 });
    expect(t.columns.map((c) => c.name)).toEqual(['Name', 'Hours']);
    expect(t.rows).toEqual([['a', 1]]);
  });
  it('stops before any file is read when a value is of the wrong kind, with a message that names the step', async () => {
    const err = (await runFlow(runner, { flow, effectiveDate: '2026-09-30', files: { Main: file }, parameterValues: { sheet: 'July', header: 0 } }).catch((e: unknown) => e)) as EngineError;
    expect(err.messageId).toBe('engine.bindNumber');
    expect(err.nodeId).toBe('in');
  });
});
