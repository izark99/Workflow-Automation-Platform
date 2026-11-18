import { describe, expect, it } from 'vitest';
import { cdnBundles, engineStartMessage, workerScriptUrl } from './duckdb-bundles';

describe('cdnBundles', () => {
  it('points both bundles at the pinned version on jsDelivr', () => {
    const b = cdnBundles('1.2.3');
    expect(b.mvp.mainModule).toBe('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.2.3/dist/duckdb-mvp.wasm');
    expect(b.mvp.mainWorker).toBe('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.2.3/dist/duckdb-browser-mvp.worker.js');
    expect(b.eh?.mainModule).toBe('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.2.3/dist/duckdb-eh.wasm');
    expect(b.eh?.mainWorker).toBe('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.2.3/dist/duckdb-browser-eh.worker.js');
  });
});

describe('workerScriptUrl', () => {
  it('starts a self-hosted worker from its own address', () => {
    expect(workerScriptUrl('self-hosted', '/assets/w.js')).toEqual({ url: '/assets/w.js', revoke: false });
  });

  it('wraps a CDN worker in a same-origin blob that imports it', async () => {
    const { url, revoke } = workerScriptUrl('cdn', 'https://cdn.example/w.js');
    expect(revoke).toBe(true);
    expect(url.startsWith('blob:')).toBe(true);
    const text = await (await fetch(url)).text();
    expect(text).toBe('importScripts("https://cdn.example/w.js");');
    URL.revokeObjectURL(url);
  });
});

describe('engineStartMessage', () => {
  it('names the CDN host and what to do when the CDN build cannot load the engine', () => {
    const m = engineStartMessage('cdn', new Error('the engine code did not load'));
    expect(m).toContain('cdn.jsdelivr.net');
    expect(m).toContain('the engine code did not load');
    expect(m).toMatch(/allow/);
  });

  it('says to reload for a self-hosted build', () => {
    expect(engineStartMessage('self-hosted', 'boom')).toBe('The data engine could not start (boom). Reload the page');
  });
});
