// Page side of the benchmark. Playwright calls window.__bench.run(file, strategy).
import type { BenchRequest, BenchResponse, Strategy } from './bench-types';

declare global {
  interface Window {
    __bench: { run: (file: File, strategy: Strategy) => Promise<BenchResponse> };
  }
}

function run(file: File, strategy: Strategy): Promise<BenchResponse> {
  // A fresh worker per run keeps runs independent of each other.
  const worker = new Worker(new URL('./bench-worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve) => {
    worker.onmessage = (ev: MessageEvent<BenchResponse>) => {
      worker.terminate();
      resolve(ev.data);
    };
    worker.onerror = (ev) => {
      worker.terminate();
      resolve({ ok: false, strategy, fileName: file.name, error: `Worker failed: ${ev.message}` });
    };
    const req: BenchRequest = { file, strategy };
    worker.postMessage(req);
  });
}

window.__bench = { run };

const fileInput = document.getElementById('file') as HTMLInputElement;
const strategySelect = document.getElementById('strategy') as HTMLSelectElement;
const out = document.getElementById('result') as HTMLPreElement;
document.getElementById('run')?.addEventListener('click', async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    out.textContent = 'Pick a file first.';
    return;
  }
  out.textContent = 'Running...';
  out.textContent = JSON.stringify(await run(file, strategySelect.value as Strategy), null, 2);
});
