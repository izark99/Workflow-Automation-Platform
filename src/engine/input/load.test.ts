import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { runFlow } from '../run';
import { createNodeRunner } from '../runner/node-runner';
import { FLOW_SCHEMA_VERSION } from '../flow/types';
import { MAX_SAFE_XLSX_BYTES } from '../size-guard';
import { strings } from '../../ui/strings';
import { EngineError, type SqlRunner, type TableData } from '../types';
import { loadInputFile, parseInputSettings, type FileSource } from './load';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

function xlsxFile(aoa: unknown[][], sheetName = 'Data', name = 'a.xlsx'): FileSource {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), sheetName);
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }) as ArrayBuffer;
  const blob = new Blob([bytes]);
  return { name, size: blob.size, blob };
}

function csvFile(text: string, name = 'a.csv'): FileSource {
  const blob = new Blob([text]);
  return { name, size: blob.size, blob };
}

let counter = 0;
async function load(file: FileSource, settings: Record<string, unknown> = {}): Promise<TableData> {
  const relation = `t_${++counter}`;
  const table = await loadInputFile(runner, file, parseInputSettings({ key: 'k', ...settings }, 'n'), relation);
  const res = await runner.query(`SELECT * FROM "${table.relation}"`);
  return { columns: table.columns, rows: res.rows as TableData['rows'] };
}

describe('parseInputSettings', () => {
  it('applies defaults', () => {
    expect(parseInputSettings({ key: 'Main' }, 'n')).toEqual({
      key: 'Main',
      sheet: undefined,
      headerRow: 1,
      skipRows: 0,
      fillDown: [],
      rowNumberColumn: undefined,
    });
  });
  it('rejects bad settings with a message that names the setting', () => {
    for (const bad of [
      {},
      { key: '' },
      { key: 'k', headerRow: 0 },
      { key: 'k', skipRows: -1 },
      { key: 'k', fillDown: 'a' },
      { key: 'k', rowNumberColumn: '' },
    ]) {
      expect(() => parseInputSettings(bad, 'n')).toThrow(EngineError);
    }
    expect(() => parseInputSettings({ key: 'k', headerRow: 0 }, 'n')).toThrow(/headerRow/);
  });
});

describe('xlsx input', () => {
  it('reads the header row, types columns and keeps blanks as NULL', async () => {
    const t = await load(
      xlsxFile([
        ['Name', 'Hours', 'Day', 'Flag'],
        ['a', 1.5, new Date(Date.UTC(2026, 8, 30)), true],
        ['b', null, new Date(Date.UTC(2026, 9, 1)), false],
      ]),
    );
    expect(t.columns).toEqual([
      { name: 'Name', type: 'text' },
      { name: 'Hours', type: 'number' },
      { name: 'Day', type: 'date' },
      { name: 'Flag', type: 'boolean' },
    ]);
    expect(t.rows.map((r) => [r[0], r[1], r[3]])).toEqual([
      ['a', 1.5, true],
      ['b', null, false],
    ]);
    const d = await runner.query(`SELECT strftime("Day", '%Y-%m-%d') FROM "t_${counter}"`);
    expect(d.rows).toEqual([['2026-09-30'], ['2026-10-01']]);
  });

  it('keeps a mixed column as text, so a value such as 2h survives', async () => {
    const t = await load(
      xlsxFile([
        ['OT', 'Who'],
        [2, 'a'],
        ['2h', 'b'],
        [null, 'c'],
        [0.5, 'd'],
      ]),
    );
    expect(t.columns[0]).toEqual({ name: 'OT', type: 'text' });
    expect(t.rows.map((r) => r[0])).toEqual(['2', '2h', null, '0.5']);
  });

  it('uses a header row below the first row, skips rows after it, and numbers the rows', async () => {
    const t = await load(xlsxFile([['Title'], [], ['ID', 'V'], ['skip', 0], ['x', 1], ['y', 2]]), {
      headerRow: 3,
      skipRows: 1,
      rowNumberColumn: 'row',
    });
    expect(t.columns.map((c) => c.name)).toEqual(['ID', 'V', 'row']);
    expect(t.rows).toEqual([
      ['x', 1, 5],
      ['y', 2, 6],
    ]);
  });

  it('turns numeric headers into text names and names empty header cells', async () => {
    const t = await load(xlsxFile([['ID', 1, 2, null, 4], ['a', 1, 2, 3, 4]]));
    expect(t.columns.map((c) => c.name)).toEqual(['ID', '1', '2', 'Column 4', '4']);
  });

  it('fills down the listed columns and only those', async () => {
    const t = await load(
      xlsxFile([
        ['ID', 'Type', 'V'],
        ['a', 'ATT', 1],
        [null, 'OT', 2],
        ['b', 'ATT', null],
        [null, null, 4],
      ]),
      { fillDown: ['ID'] },
    );
    expect(t.rows).toEqual([
      ['a', 'ATT', 1],
      ['a', 'OT', 2],
      ['b', 'ATT', null],
      ['b', null, 4],
    ]);
  });

  it('skips fully blank rows', async () => {
    const t = await load(xlsxFile([['A'], ['x'], [], [null], ['y']]));
    expect(t.rows).toEqual([['x'], ['y']]);
  });

  it('reads the named sheet and reports an unknown sheet with the sheet list', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['A'], ['first']]), 'One');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['B'], ['second']]), 'Two');
    const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer]);
    const file = { name: 'a.xlsx', size: blob.size, blob };
    expect((await load(file, { sheet: 'Two' })).rows).toEqual([['second']]);
    await expect(load(file, { sheet: 'Nope' })).rejects.toThrow(/Nope.*One, Two/);
  });

  it('fails clearly on an unknown fill-down column, a duplicate header and a missing header row', async () => {
    await expect(load(xlsxFile([['ID'], ['a']]), { fillDown: ['id'] })).rejects.toThrow(/case-sensitive/);
    await expect(load(xlsxFile([['A', 'A'], [1, 2]]))).rejects.toThrow(/"A".*more than once/);
    await expect(load(xlsxFile([['A'], [1]]), { headerRow: 9 })).rejects.toThrow(/header row 9/i);
  });

  it('refuses a file above the size limit before reading it', async () => {
    const file = { ...xlsxFile([['A'], [1]], 'Data', 'big.xlsx'), size: MAX_SAFE_XLSX_BYTES + 1 };
    const err = await load(file).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('file_too_large');
    expect((err as EngineError).message).toBe(strings.xlsxTooLarge('big.xlsx', file.size, MAX_SAFE_XLSX_BYTES));
  });
});

describe('csv input', () => {
  it('reads header, quoted values and types numbers and dates', async () => {
    const t = await load(csvFile('Name,Hours,Day\n"a, b",1.5,2026-09-30\nc,,2026-10-01\n'));
    expect(t.columns).toEqual([
      { name: 'Name', type: 'text' },
      { name: 'Hours', type: 'number' },
      { name: 'Day', type: 'date' },
    ]);
    expect(t.rows.map((r) => [r[0], r[1]])).toEqual([
      ['a, b', 1.5],
      ['c', null],
    ]);
  });

  it('keeps codes with leading zeros and mixed columns as text', async () => {
    const t = await load(csvFile('Code,OT\n007,2\n010,2h\n'));
    expect(t.columns.map((c) => c.type)).toEqual(['text', 'text']);
    expect(t.rows).toEqual([
      ['007', '2'],
      ['010', '2h'],
    ]);
  });

  it('supports header row, skip rows, fill down and row numbers', async () => {
    const t = await load(csvFile('Title\nnote\nID,V\nskip,0\na,1\n,2\nb,3\n'), {
      headerRow: 3,
      skipRows: 1,
      fillDown: ['ID'],
      rowNumberColumn: 'row',
    });
    expect(t.columns.map((c) => c.name)).toEqual(['ID', 'V', 'row']);
    expect(t.rows).toEqual([
      ['a', 1, 5],
      ['a', 2, 6],
      ['b', 3, 7],
    ]);
  });

  it('does not refuse a large csv with the xlsx limit', async () => {
    const file = { ...csvFile('A\n1\n'), size: MAX_SAFE_XLSX_BYTES + 1 };
    expect((await load(file)).rows).toEqual([[1]]);
  });
});

describe('runFlow with files', () => {
  const flow = {
    schemaVersion: FLOW_SCHEMA_VERSION,
    nodes: [{ id: 'in', type: 'input_file', settings: { key: 'Main', headerRow: 2 } }],
    edges: [],
  };
  it('loads the file of each input node and previews it', async () => {
    const result = await runFlow(runner, {
      flow,
      effectiveDate: '2026-09-30',
      files: { Main: xlsxFile([['title'], ['A', 'B'], ['x', 1]]) },
    });
    try {
      expect((await result.preview('in')).rows).toEqual([['x', 1]]);
    } finally {
      await result.dispose();
    }
  });
  it('says which input has no file', async () => {
    const err = await runFlow(runner, { flow, effectiveDate: '2026-09-30' }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('missing_input_table');
    expect((err as EngineError).message).toContain('"Main"');
  });
  it('rejects two input steps that share one key', async () => {
    const two = { ...flow, nodes: [...flow.nodes, { id: 'in2', type: 'input_file', settings: { key: 'Main' } }] };
    const err = await runFlow(runner, {
      flow: two,
      effectiveDate: '2026-09-30',
      files: { Main: csvFile('A\n1\n') },
    }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_settings');
  });
});
