import * as duckdb from '@duckdb/duckdb-wasm';
import type { QueryResult, SqlRunner } from '../types';
import { cdnBundles, engineStartMessage, workerScriptUrl, type DuckdbSource } from './duckdb-bundles';

/**
 * `vite build --mode pages` sets this to `cdn` (vite.config.ts, decision D71). Every other build serves the bundles
 * itself (decision D7). The value is fixed at build time, so a self-hosted build never ships the CDN path and a CDN
 * build never ships the two large wasm files.
 */
const SOURCE: DuckdbSource = import.meta.env.VITE_DUCKDB_SOURCE === 'cdn' ? 'cdn' : 'self-hosted';

async function bundles(): Promise<duckdb.DuckDBBundles> {
  if (SOURCE === 'cdn') return cdnBundles(duckdb.PACKAGE_VERSION);
  return (await import('./duckdb-self-hosted')).selfHostedBundles;
}

/**
 * Starts DuckDB-WASM in a Web Worker and returns it as a `SqlRunner`. Only code is loaded over the network; file
 * content is registered from the page and never sent anywhere.
 */
export async function createBrowserRunner(): Promise<SqlRunner> {
  const bundle = await duckdb.selectBundle(await bundles());
  const script = workerScriptUrl(SOURCE, bundle.mainWorker!);
  const worker = new Worker(script.url);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  // A worker whose script cannot load fires `error` and never answers, so the start would wait forever without this.
  const failed = new Promise<never>((_, reject) => {
    worker.addEventListener('error', () => reject(new Error('the engine code did not load')), { once: true });
  });
  try {
    await Promise.race([db.instantiate(bundle.mainModule, bundle.pthreadWorker), failed]);
  } catch (e) {
    worker.terminate();
    throw new Error(engineStartMessage(SOURCE, e), { cause: e });
  } finally {
    if (script.revoke) URL.revokeObjectURL(script.url);
  }
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
