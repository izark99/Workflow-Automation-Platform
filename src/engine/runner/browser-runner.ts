import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbWasmMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdbWorkerMvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbWasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbWorkerEh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import type { QueryResult, SqlRunner } from '../types';

/**
 * Starts DuckDB-WASM in a Web Worker and returns it as a `SqlRunner`. The bundles are static assets of
 * this app (decision D7), so a run makes no network request for file content or for code.
 */
export async function createBrowserRunner(): Promise<SqlRunner> {
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: duckdbWasmMvp, mainWorker: duckdbWorkerMvp },
    eh: { mainModule: duckdbWasmEh, mainWorker: duckdbWorkerEh },
  });
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();

  return {
    async exec(sql) {
      await conn.query(sql);
    },
    async query(sql): Promise<QueryResult> {
      const table = await conn.query(sql);
      const columns = table.schema.fields.map((f) => f.name);
      const rows = table.toArray().map((r) => {
        const json = r.toJSON() as Record<string, unknown>;
        return columns.map((c) => {
          const v = json[c];
          return typeof v === 'bigint' ? Number(v) : v;
        });
      });
      return { columns, rows };
    },
    async registerFile(name, data) {
      // A File is read through its handle, so a large csv is not copied into the page.
      await db.registerFileHandle(name, data as File, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
    },
    async cancel() {
      await conn.cancelSent();
    },
    async close() {
      await conn.close();
      await db.terminate();
    },
  };
}
