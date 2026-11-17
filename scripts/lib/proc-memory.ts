// Peak memory of the renderer process, read from the kernel (Linux only).
// The page and its workers, including DuckDB-WASM, live in the renderer process.
import { readFile } from 'node:fs/promises';
import type { CDPSession } from '@playwright/test';
import { parseVmKb } from './spike-runner.ts';

export interface MemorySampler {
  /** Stops sampling and returns the largest peak resident size seen, in MB. */
  stop: () => Promise<number>;
}

async function rendererPeaksKb(cdp: CDPSession): Promise<number[]> {
  const info = (await cdp.send('SystemInfo.getProcessInfo')) as { processInfo: { type: string; id: number }[] };
  const peaks: number[] = [];
  for (const p of info.processInfo) {
    if (p.type !== 'renderer') continue;
    try {
      const status = await readFile(`/proc/${p.id}/status`, 'utf8');
      // VmHWM is the kernel's high-water mark of resident memory for the process.
      const kb = Math.max(parseVmKb(status, 'VmHWM') ?? 0, parseVmKb(status, 'VmRSS') ?? 0);
      if (kb > 0) peaks.push(kb);
    } catch {
      // The process ended between the two calls. The earlier samples still hold its peak.
    }
  }
  return peaks;
}

export function startMemorySampler(cdp: CDPSession, everyMs = 200): MemorySampler {
  let peakKb = 0;
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      try {
        for (const kb of await rendererPeaksKb(cdp)) peakKb = Math.max(peakKb, kb);
      } catch {
        // The browser is gone. Keep the peak recorded so far.
      }
      await new Promise((r) => setTimeout(r, everyMs));
    }
  })();
  return {
    stop: async () => {
      stopped = true;
      await loop;
      return Math.round(peakKb / 1024);
    },
  };
}
