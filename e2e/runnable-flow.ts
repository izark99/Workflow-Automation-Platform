import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

/** A published flow that reads one csv and looks the kind up in the reference table "OT limits". */
/** Puts the flow into the local store before the page loads (the dev and test builds read `dfw.seed`). */
export async function seedRunnableFlow(page: Page) {
  const s = seedSnapshot();
  const node = (id: string, type: string, settings: Record<string, unknown>, y: number) => ({ id, type, label: id, position: { x: 0, y }, settings });
  s.flows.push({
    id: 'flow-run',
    name: 'Run test flow',
    ownerId: 'user-harold',
    scope: 'personal',
    deletedAt: null,
    groupIds: [],
    versions: [
      {
        versionNo: 1,
        validFrom: '2026-01-01',
        validTo: null,
        status: 'published',
        changeNote: 'First version',
        definition: {
          schemaVersion: 1,
          nodes: [
            node('People', 'input_file', { key: 'people', headerRow: 1 }, 0),
            node('Limits', 'lookup_join', { source: { kind: 'reference', table: 'OT limits' }, keys: [{ left: 'kind', right: 'period' }], bring: [{ column: 'limit_hours', as: 'limit' }], onNoMatch: 'blank' }, 96),
            node('Out', 'output', { file: 'Result', format: 'xlsx', sheet: 'People' }, 192),
          ],
          edges: [
            { source: 'People', target: 'Limits', targetHandle: 'left' },
            { source: 'Limits', target: 'Out' },
          ],
        },
      },
    ],
  });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
}
