import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { LoggedRequest } from '../scripts/lib/request-audit';
import type { RunArgs, RunReply } from './page';

export interface DatasetConfig {
  name: string;
  /** Folder of the dataset, relative to the repository root. */
  dir: string;
  effectiveDate: string;
  /** Input files by the logical key of the Input step, relative to `dir`. */
  inputs: Record<string, string>;
  referenceFile?: string;
  referenceSheets?: string[];
  referenceValidFrom?: string;
  expectedFile: string;
}

export interface RanOutput {
  files: { name: string; bytes: Uint8Array }[];
  resolved: unknown;
}

const b64 = (file: string) => readFileSync(file).toString('base64');

/** Runs a flow on a dataset in the browser page and returns the output files, or throws the engine's message. */
export async function runDataset(page: Page, flow: unknown, ds: DatasetConfig): Promise<RanOutput> {
  await page.goto('/acceptance/index.html');
  await page.waitForFunction(() => typeof window.runDataset === 'function');
  const args: RunArgs = {
    flow,
    effectiveDate: ds.effectiveDate,
    files: Object.fromEntries(
      Object.entries(ds.inputs).map(([key, rel]) => [key, { name: path.basename(rel), base64: b64(path.join(ds.dir, rel)) }]),
    ),
    reference: ds.referenceFile
      ? { base64: b64(path.join(ds.dir, ds.referenceFile)), validFrom: ds.referenceValidFrom!, sheets: ds.referenceSheets! }
      : undefined,
  };
  const reply: RunReply = await page.evaluate((a) => window.runDataset(a), args);
  if (!reply.ok) throw new Error(`The engine stopped (${reply.code}): ${reply.message}`);
  return {
    files: reply.files.map((f) => ({ name: f.name, bytes: new Uint8Array(Buffer.from(f.base64, 'base64')) })),
    resolved: reply.resolved,
  };
}

/** Records every request of the page from now on, including failed ones and web sockets. Call it before the first goto. */
export function watchRequests(page: Page): LoggedRequest[] {
  const log: LoggedRequest[] = [];
  page.on('request', (r) => log.push({ url: r.url(), method: r.method(), postData: r.postData(), headers: r.headers() }));
  page.on('websocket', (ws) => log.push({ url: ws.url(), method: 'WEBSOCKET', postData: null, headers: {} }));
  return log;
}
