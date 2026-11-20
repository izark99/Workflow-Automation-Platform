import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

export const REF_FLOW = '/flows/flow-refstep/versions/1';

const columns = [{ name: 'code', type: 'text' as const }, { name: 'limit', type: 'number' as const }];
const version = (versionNo: number, validFrom: string, validTo: string | null) => ({ versionNo, validFrom, validTo, status: 'published' as const, columns, rows: [['A', 4]] });

export interface ReferenceStepSeed {
  /** The signed-in user. The flow belongs to this user. Default: the admin. */
  user?: 'user-harold' | 'user-lan';
  status?: 'draft' | 'published';
  /** The steps of the saved version. Default: one Reference table step with no table. */
  nodes?: { id: string; type: string; label: string; position: { x: number; y: number }; settings: Record<string, unknown> }[];
  /** The connections of the saved version. Default: none. */
  edges?: unknown[];
  /** Flow parameters. With them the definition is schemaVersion 3 (settings may be bound). */
  parameters?: unknown[];
  /** The dates of the saved flow version. Default: from 2026-01-01, open ended. */
  validFrom?: string;
  validTo?: string | null;
  /** Today in the browser's time zone (ISO): the table "Dated" changes its version on this day. */
  today?: string;
}

/**
 * A draft flow and three tables that make each state of the step: "Closed range" is valid on every date of the tests,
 * "Old limits" ended in 2020 (no version covers today), and "Dated" has one version up to yesterday and one from today.
 */
export async function seedReferenceStep(page: Page, opts: ReferenceStepSeed = {}): Promise<void> {
  const s = seedSnapshot();
  const user = opts.user ?? 'user-harold';
  s.currentUserId = user;
  const today = opts.today ?? '2026-11-20';
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  s.refTables.push(
    { id: 'ref-closed', name: 'Closed range', description: 'Valid on every test date.', versions: [version(1, '2026-01-01', '2099-12-31')] },
    { id: 'ref-old', name: 'Old limits', description: 'Ended in 2020.', versions: [version(1, '2020-01-01', '2020-12-31')] },
    { id: 'ref-ends', name: 'Ends 2026', description: 'Its last version ends on 31 Dec 2026.', versions: [version(1, '2026-01-01', '2026-12-31')] },
    { id: 'ref-dated', name: 'Dated', description: 'Changes version today.', versions: [version(1, '2000-01-01', yesterday), version(2, today, null)] },
  );
  s.flows.push({
    id: 'flow-refstep',
    name: 'Reference step flow',
    ownerId: user,
    scope: 'personal',
    deletedAt: null,
    groupIds: [],
    versions: [
      {
        versionNo: 1,
        validFrom: opts.validFrom ?? '2026-01-01',
        validTo: opts.validTo === undefined ? null : opts.validTo,
        status: opts.status ?? 'draft',
        changeNote: '',
        definition: { schemaVersion: opts.parameters ? 3 : 1, ...(opts.parameters ? { parameters: opts.parameters } : {}), nodes: opts.nodes ?? [{ id: 'ref', type: 'reference_table', label: 'Reference table', position: { x: 0, y: 0 }, settings: {} }], edges: opts.edges ?? [] },
      },
    ],
  });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
}

/** Today in the browser's time zone, as the builder reads it. */
export const browserToday = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
