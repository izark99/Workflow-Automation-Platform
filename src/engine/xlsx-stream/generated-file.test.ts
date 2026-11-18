import { openAsBlob } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { writeXlsx } from '../../../scripts/lib/bench-data.ts';
import { readXlsx } from './index';

// The benchmark generator writes shared strings, date styles and 40 columns like Excel does.
describe('readXlsx on a generated benchmark file', () => {
  let dir = '';
  let path = '';
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'xlsx-stream-'));
    path = join(dir, 'gen.xlsx');
    await writeXlsx(path, 2001);
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('matches SheetJS cell by cell', async () => {
    const wb = XLSX.read(await (await openAsBlob(path)).arrayBuffer(), { type: 'array', dense: true });
    const oracle = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: true });
    const ours: unknown[][] = [];
    for await (const r of readXlsx(await openAsBlob(path))) {
      // Dates come back as Date values. SheetJS (raw) gives the Excel serial number.
      ours.push(r.cells.map((c) => (c instanceof Date ? c.getTime() / 86_400_000 + 25569 : c)));
    }
    expect(ours).toHaveLength(2001);
    expect(oracle).toHaveLength(2001);
    expect(ours[0]![0]).toBe('id');
    expect(ours[1]![2]).toBeGreaterThanOrEqual(45000);
    for (let r = 0; r < ours.length; r++) {
      expect(Array.from(ours[r]!)).toEqual(Array.from(oracle[r]!));
    }
  });
});
