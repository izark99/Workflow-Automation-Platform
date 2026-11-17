// Spike worker: loads one file into DuckDB-WASM and runs one group-by query.
// Everything runs in this worker, so the page stays responsive and nothing leaves the browser.
import * as duckdb from '@duckdb/duckdb-wasm';
import * as arrow from 'apache-arrow';
import * as XLSX from 'xlsx';
import duckdbWasmMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdbWorkerMvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbWasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbWorkerEh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { columnKinds, rowsToColumns, sanitizeHeader, type ColumnKind } from './columns';
import { GROUP_QUERY, type BenchRequest, type BenchResponse } from './bench-types';

const CHUNK_ROWS = 50_000;

async function startDuckDb(): Promise<duckdb.AsyncDuckDB> {
  // Bundles are served by this app. No CDN is used, so a run makes no network request.
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: duckdbWasmMvp, mainWorker: duckdbWorkerMvp },
    eh: { mainModule: duckdbWasmEh, mainWorker: duckdbWorkerEh },
  });
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(bundle.mainWorker!));
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

function arrowType(kind: ColumnKind): arrow.DataType {
  if (kind === 'number') return new arrow.Float64();
  if (kind === 'date') return new arrow.TimestampMillisecond();
  return new arrow.Utf8();
}

function toVector(values: (number | string | Date | null)[], kind: ColumnKind): arrow.Vector {
  if (kind === 'date') {
    const ms = values.map((v) => (v instanceof Date ? v.getTime() : null));
    return arrow.vectorFromArray(ms, arrowType(kind));
  }
  return arrow.vectorFromArray(values, arrowType(kind));
}

/** Strategy A: parse the whole sheet with SheetJS, then insert Arrow chunks. */
async function loadSheetJsWhole(db: duckdb.AsyncDuckDB, conn: duckdb.AsyncDuckDBConnection, file: File): Promise<number> {
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: 'string', dense: true, cellDates: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', dense: true, cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = sheetName === undefined ? undefined : wb.Sheets[sheetName];
  if (!ws) throw new Error('The file has no sheet. Check the file and try again.');
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false });
  const header = sanitizeHeader(aoa[0] ?? []);
  const first = aoa[1];
  if (!first) throw new Error('The sheet has a header but no data rows.');
  const kinds = columnKinds(first);
  let created = false;
  for (let start = 1; start < aoa.length; start += CHUNK_ROWS) {
    const cols = rowsToColumns(aoa.slice(start, start + CHUNK_ROWS), kinds);
    const data: Record<string, arrow.Vector> = {};
    header.forEach((name, i) => {
      data[name] = toVector(cols[i]!, kinds[i]!);
    });
    await conn.insertArrowTable(new arrow.Table(data), { name: 'bench', create: !created });
    created = true;
  }
  void db;
  return header.length;
}

/** Strategy B (csv only): let DuckDB read the file handle directly. */
async function loadDuckDbCsv(db: duckdb.AsyncDuckDB, conn: duckdb.AsyncDuckDBConnection, file: File): Promise<number> {
  if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('duckdb-csv reads csv files only.');
  await db.registerFileHandle(file.name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
  const path = file.name.replaceAll("'", "''");
  await conn.query(`CREATE TABLE bench AS SELECT * FROM read_csv('${path}', header = true)`);
  const cols = await conn.query('SELECT count(*)::INTEGER AS c FROM pragma_table_info(\'bench\')');
  return Number(cols.getChildAt(0)?.get(0) ?? 0);
}

async function run({ file, strategy }: BenchRequest): Promise<BenchResponse> {
  const base = { strategy, fileName: file.name };
  let db: duckdb.AsyncDuckDB | undefined;
  try {
    db = await startDuckDb();
    const conn = await db.connect();
    const t0 = performance.now();
    const columns =
      strategy === 'duckdb-csv' ? await loadDuckDbCsv(db, conn, file) : await loadSheetJsWhole(db, conn, file);
    const loadMs = performance.now() - t0;
    const rows = Number((await conn.query('SELECT count(*)::INTEGER AS c FROM bench')).getChildAt(0)?.get(0));
    const t1 = performance.now();
    const result = await conn.query(GROUP_QUERY);
    const queryMs = performance.now() - t1;
    return { ok: true, ...base, rows, columns, groups: result.numRows, loadMs, queryMs };
  } catch (e) {
    return { ok: false, ...base, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await db?.terminate().catch(() => undefined);
  }
}

self.onmessage = async (ev: MessageEvent<BenchRequest>) => {
  self.postMessage(await run(ev.data));
};
