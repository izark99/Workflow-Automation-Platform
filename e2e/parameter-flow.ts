import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

/** The parameters of the seeded flow: one of each type. */
export const SEED_PARAMETERS = [
  { key: 'cutoff', label: 'Cut-off date', type: 'date', required: true, help: 'People who joined after this date are left out.' },
  { key: 'note', label: 'Note', type: 'text', required: false },
  { key: 'min_hours', label: 'Minimum hours', type: 'number', required: true, default: 0 },
  { key: 'team', label: 'Team', type: 'list', required: true, options: ['Plant', 'Office'], default: 'Plant' },
  { key: 'strict', label: 'Strict mode', type: 'boolean', required: false, default: false, help: 'Switch on to apply the stricter rule.' },
];

/**
 * A flow "Parameter flow" (id `flow-param`) with a published version 1 and a draft version 2, both with the parameters
 * above. The Filter keeps the people who joined on or before the date; the Formula column writes the note after the name.
 * Puts it into the local store before the page loads (the dev and test builds read `dfw.seed`).
 */
export async function seedParameterFlow(page: Page, parameters: unknown[] = SEED_PARAMETERS): Promise<void> {
  const s = seedSnapshot();
  const node = (id: string, type: string, settings: Record<string, unknown>, y: number) => ({ id, type, label: id, position: { x: 0, y }, settings });
  const definition = {
    schemaVersion: 2,
    parameters,
    nodes: [
      node('People', 'input_file', { key: 'people', headerRow: 1 }, 0),
      node('Keep', 'filter', { condition: '[joined] <= PARAM("cutoff")' }, 96),
      node('Tag', 'formula_column', { name: 'Tag', expression: '[name] & " " & PARAM("note")' }, 192),
      node('Out', 'output', { file: 'Result', format: 'xlsx', sheet: 'People' }, 288),
    ],
    edges: [
      { source: 'People', target: 'Keep' },
      { source: 'Keep', target: 'Tag' },
      { source: 'Tag', target: 'Out' },
    ],
  };
  s.flows.push({
    id: 'flow-param',
    name: 'Parameter flow',
    ownerId: 'user-harold',
    scope: 'personal',
    deletedAt: null,
    groupIds: [],
    versions: [
      { versionNo: 1, validFrom: '2026-01-01', validTo: '2026-12-31', status: 'published', changeNote: 'First version', definition },
      { versionNo: 2, validFrom: '2027-01-01', validTo: null, status: 'draft', changeNote: 'Next year', definition: structuredClone(definition) },
    ],
  } as never);
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
}
