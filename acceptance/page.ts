// Browser side of the acceptance test: runs the real engine, in the real browser runner, on files that the test hands
// in, and returns the output files. It has no knowledge of any dataset.
import * as XLSX from 'xlsx';
import './print-probe';
import type { ParameterValues } from '../src/engine/flow/parameter-values';
import { runFlow } from '../src/engine/run';
import { createBrowserRunner } from '../src/engine/runner/browser-runner';
import { buildOutputFiles } from '../src/engine/output/export';
import { prepareRun } from '../src/engine/versions';
import type { Cell, Column, ColumnType, TableData } from '../src/engine/types';

export interface RunArgs {
  flow: unknown;
  effectiveDate: string;
  /** Input files by the logical key of the Input step. */
  files: Record<string, { name: string; base64: string }>;
  /** A workbook that holds reference tables, one per sheet, valid from `validFrom` with no end date. */
  /** The values of the flow parameters, by key. */
  parameterValues?: ParameterValues;
  reference?: { base64: string; validFrom: string; sheets: string[] };
}

export type RunReply =
  | { ok: true; files: { name: string; base64: string }[]; resolved: unknown }
  | { ok: false; code: string; message: string };

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const text = atob(b64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** A sheet as a table: the first row is the header, types follow the cells (all numbers, all dates, else text). */
function sheetToTable(ws: XLSX.WorkSheet): TableData {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const header = (aoa[0] ?? []).map(String);
  const body = aoa.slice(1);
  const columns: Column[] = header.map((name, c) => {
    const values = body.map((row) => row[c]).filter((v) => v !== null && v !== '');
    let type: ColumnType = 'text';
    if (values.length > 0 && values.every((v) => typeof v === 'number')) type = 'number';
    else if (values.length > 0 && values.every((v) => v instanceof Date)) type = 'date';
    return { name, type };
  });
  const rows: Cell[][] = body.map((row) =>
    columns.map((col, c) => {
      const v = row[c] ?? null;
      if (v === null || v === '') return null;
      if (col.type === 'number') return v as number;
      if (col.type === 'date') return (v as Date).toISOString().slice(0, 10);
      return String(v);
    }),
  );
  return { columns, rows };
}

async function run(args: RunArgs): Promise<RunReply> {
  const runner = await createBrowserRunner();
  try {
    const files = Object.fromEntries(
      Object.entries(args.files).map(([key, f]) => {
        // A File, as the file picker of the app gives it. DuckDB reads a csv from the File without copying it.
        const file = new File([fromBase64(f.base64)], f.name);
        return [key, { name: f.name, size: file.size, blob: file }];
      }),
    );
    const refTables = [];
    if (args.reference) {
      const wb = XLSX.read(fromBase64(args.reference.base64), { type: 'array', cellDates: true });
      for (const name of args.reference.sheets) {
        const ws = wb.Sheets[name];
        if (!ws) throw new Error(`The reference workbook has no sheet "${name}".`);
        const t = sheetToTable(ws);
        refTables.push({ name, versions: [{ versionNo: 1, validFrom: args.reference.validFrom, validTo: null, columns: t.columns, rows: t.rows }] });
      }
    }
    const prepared = prepareRun({
      flowName: 'acceptance',
      flowVersions: [{ versionNo: 1, validFrom: '2000-01-01', validTo: null, definition: args.flow }],
      refTables,
      effectiveDate: args.effectiveDate,
    });
    const result = await runFlow(runner, {
      flow: prepared.definition,
      effectiveDate: args.effectiveDate,
      parameterValues: args.parameterValues,
      files,
      refTables: prepared.refTables,
    });
    try {
      const out = await buildOutputFiles(result, prepared.definition as { nodes: never[] }, { flowName: 'acceptance', effectiveDate: args.effectiveDate, parameters: Object.fromEntries(Object.entries(args.parameterValues ?? {}).map(([k, v]) => [k, String(v)])), language: 'vi' });
      return { ok: true, files: out.map((f) => ({ name: f.name, base64: toBase64(f.bytes) })), resolved: prepared.resolved };
    } finally {
      await result.dispose();
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ok: false, code: err.code ?? 'error', message: err.message ?? String(e) };
  } finally {
    await runner.close();
  }
}

declare global {
  interface Window {
    runDataset: (args: RunArgs) => Promise<RunReply>;
  }
}
window.runDataset = run;
const status = document.getElementById('status');
if (status) status.textContent = 'Ready';
