import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { DATASETS, TIMESHEET_FLOW } from './datasets';
import { runDataset } from './helpers';

// Only for the Pages build (`npm run test:acceptance:pages`, decision D71): when the network blocks jsDelivr, a run
// stops with a message that names the host, instead of waiting forever.
test('a blocked CDN stops the run with a message that names the host', async ({ page }) => {
  test.skip(process.env.VITE_DUCKDB_SOURCE !== 'cdn', 'Only the Pages build loads the engine from jsDelivr.');
  await page.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  const flow = JSON.parse(readFileSync(TIMESHEET_FLOW, 'utf8'));
  const message = await runDataset(page, flow, DATASETS[0]!).then(
    () => 'the run finished',
    (e: Error) => e.message,
  );
  expect(message).toContain('could not be loaded from cdn.jsdelivr.net');
  expect(message).toMatch(/ask IT to allow it/);
});
