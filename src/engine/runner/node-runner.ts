import { createRequire } from 'node:module';
import path from 'node:path';
import type { QueryResult, SqlRunner } from '../types';

/**
 * Runs the same DuckDB-WASM build in Node, through its blocking API. Used by unit tests and by
 * tools that run outside a browser. It cannot stop a running query, so `cancel` does nothing.
 */
export async function createNodeRunner(): Promise<SqlRunner> {
  const require = createRequire(import.meta.url);
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs');
  const dist = path.dirname(require.resolve('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs'));
  const bundles = {
    mvp: { mainModule: path.join(dist, 'duckdb-mvp.wasm'), mainWorker: path.join(dist, 'duckdb-node-mvp.worker.cjs') },
    eh: { mainModule: path.join(dist, 'duckdb-eh.wasm'), mainWorker: path.join(dist, 'duckdb-node-eh.worker.cjs') },
  };
  const db = await duckdb.createDuckDB(bundles, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
  await db.instantiate(() => {});
  const conn = db.connect();

  return {
    // async, so that a SQL error is a rejected promise like in the browser runner
    async exec(sql) {
      conn.query(sql);
    },
    async query(sql): Promise<QueryResult> {
      const table = conn.query(sql);
      const columns: string[] = table.schema.fields.map((f: { name: string }) => f.name);
      const rows = table.toArray().map((r: { toJSON(): unknown }) => {
        const json = r.toJSON() as Record<string, unknown>;
        return columns.map((c) => {
          const v = json[c];
          return typeof v === 'bigint' ? Number(v) : v;
        });
      });
      return { columns, rows };
    },
    cancel: () => Promise.resolve(),
    async close() {
      conn.close();
    },
  };
}
