import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

/**
 * A published flow (`flow-all-steps`) that holds all seven steps of Phase 8: Clean text, Split column, Remove duplicates, Sort,
 * Top N, Check and Compare, with five Output steps. Used by the end-to-end journey and by a UI-rules route.
 */
export async function seedAllSteps(page: Page): Promise<void> {
  const s = seedSnapshot();
  const node = (id: string, type: string, label: string, settings: Record<string, unknown>, x: number, y: number) => ({ id, type, label, position: { x, y }, settings });
  const out = (id: string, sheet: string, y: number) => node(id, 'output', sheet, { file: 'Result', format: 'xlsx', sheet }, 1800, y);
  s.flows.push({
    id: 'flow-all-steps', name: 'All new steps', ownerId: 'user-harold', scope: 'personal', deletedAt: null, groupIds: [],
    versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', changeNote: '', definition: {
      schemaVersion: 4,
      nodes: [
        node('new', 'input_file', 'This month', { key: 'new', headerRow: 1 }, 0, 0),
        node('old', 'input_file', 'Last month', { key: 'old', headerRow: 1 }, 1080, 400),
        node('clean', 'clean_text', 'Clean names', { columns: ['name'], trim: true, collapse: true, nonPrinting: false, caseMode: 'proper', removeMarks: false, target: 'replace' }, 280, 0),
        node('split', 'split_column', 'Split names', { column: 'name', cut: 'last_space', names: ['Family', 'Given'], rest: 'last', trim: true, keepOriginal: false }, 560, 0),
        node('dedupe', 'dedupe', 'One row per id', { columns: ['id'], keep: 'first' }, 840, 0),
        node('sort', 'sort', 'Most hours first', { keys: [{ column: 'hours', direction: 'desc' }] }, 1120, 0),
        node('top', 'top_n', 'Top four', { n: 4, order: 'first', groupBy: [] }, 1400, 0),
        node('check', 'check', 'Hours check', { rules: [{ name: 'Hours', condition: '[hours] <= 24', message: 'More than 24 hours.' }], stop: false }, 1680, 0),
        node('compare', 'compare', 'Against last month', { keys: [{ new: 'id', old: 'id' }], compare: [] }, 1680, 400),
        out('o1', 'Passed', 800), out('o2', 'Errors', 900), out('o3', 'Changed', 1000), out('o4', 'Removed rows', 1100), out('o5', 'Gone', 1200),
      ],
      edges: [
        { source: 'new', target: 'clean' },
        { source: 'clean', target: 'split' },
        { source: 'split', target: 'dedupe' },
        { source: 'dedupe', sourceHandle: 'kept', target: 'sort' },
        { source: 'sort', target: 'top' },
        { source: 'top', target: 'check' },
        { source: 'check', sourceHandle: 'ok', target: 'compare', targetHandle: 'new' },
        { source: 'old', target: 'compare', targetHandle: 'old' },
        { source: 'check', sourceHandle: 'ok', target: 'o1' },
        { source: 'check', sourceHandle: 'errors', target: 'o2' },
        { source: 'compare', sourceHandle: 'changed', target: 'o3' },
        { source: 'dedupe', sourceHandle: 'removed', target: 'o4' },
        { source: 'compare', sourceHandle: 'removed', target: 'o5' },
      ],
    } }],
  });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
}
