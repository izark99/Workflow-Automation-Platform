import type { DuckDBBundles } from '@duckdb/duckdb-wasm';

/** Where the DuckDB-WASM code comes from. See decisions D7 and D71. */
export type DuckdbSource = 'self-hosted' | 'cdn';

/**
 * The jsDelivr address of the pinned package. The version is the one in package.json, so the code that runs is the
 * code that the tests ran against.
 */
export function cdnBundles(version: string): DuckDBBundles {
  const base = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${version}/dist`;
  return {
    mvp: { mainModule: `${base}/duckdb-mvp.wasm`, mainWorker: `${base}/duckdb-browser-mvp.worker.js` },
    eh: { mainModule: `${base}/duckdb-eh.wasm`, mainWorker: `${base}/duckdb-browser-eh.worker.js` },
  };
}

/**
 * A worker script on another origin cannot be started with `new Worker(url)`. A small same-origin blob that
 * imports it can. A self-hosted worker is started directly.
 */
export function workerScriptUrl(source: DuckdbSource, mainWorker: string): { url: string; revoke: boolean } {
  if (source === 'self-hosted') return { url: mainWorker, revoke: false };
  const blob = new Blob([`importScripts(${JSON.stringify(mainWorker)});`], { type: 'text/javascript' });
  return { url: URL.createObjectURL(blob), revoke: true };
}

/** What failed when the engine did not start, and what to do next. The CDN build names the host to allow. */
export function engineStartMessage(source: DuckdbSource, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  if (source === 'cdn') {
    return `The data engine could not be loaded from cdn.jsdelivr.net (${detail}). Check that your network allows cdn.jsdelivr.net, or ask IT to allow it, then reload the page`;
  }
  return `The data engine could not start (${detail}). Reload the page`;
}
