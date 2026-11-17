import { describe, expect, it } from 'vitest';
import { seedSnapshot } from '../../store/seed';
import type { FlowRecord } from '../../store/types';
import { addStep, connectSteps, emptyDefinition } from './graph';
import { canEditFlow, canonical, isDirty, publishBlockers, publishSummary, suggestValidFrom, versionOptionLabel } from './version-logic';

const seed = seedSnapshot();
const timesheet = seed.flows.find((f) => f.id === 'flow-timesheet')!;
const user = (id: string) => seed.users.find((u) => u.id === id);

describe('version labels', () => {
  it('writes the versions as the screens do', () => {
    expect(timesheet.versions.map(versionOptionLabel)).toEqual([
      'v1, 01 Jan 2026 to 31 Mar 2026',
      'v2, 01 Apr 2026 to 30 Jun 2026',
      'v3, from 01 Jul 2026',
      'v4, draft from 01 Jan 2027',
    ]);
  });
});

describe('unsaved changes', () => {
  it('compares JSON whatever the order of keys', () => {
    expect(canonical({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 3 } })).toBe(canonical({ a: { c: 3, d: [2, { y: 2, z: 1 }] }, b: 1 }));
    expect(isDirty(emptyDefinition(), { schemaVersion: 1, edges: [], nodes: [] })).toBe(false);
    expect(isDirty(addStep(emptyDefinition(), 'sql', { x: 0, y: 0 }).definition, emptyDefinition())).toBe(true);
  });
});

describe('who may edit', () => {
  it('the admin edits any flow; a user edits only their own personal flow', () => {
    const personal = seed.flows.find((f) => f.id === 'flow-insurance') as FlowRecord;
    expect(canEditFlow(user('user-harold'), timesheet)).toBe(true);
    expect(canEditFlow(user('user-minh'), personal)).toBe(true);
    expect(canEditFlow(user('user-lan'), personal)).toBe(false);
    expect(canEditFlow(user('user-lan'), timesheet)).toBe(false);
    expect(canEditFlow(undefined, personal)).toBe(false);
  });
});

describe('a start date for a new version', () => {
  it('is today, or the day after the latest start when that is later', () => {
    expect(suggestValidFrom([{ validFrom: '2026-01-01' }], '2026-11-17')).toBe('2026-11-17');
    expect(suggestValidFrom([{ validFrom: '2026-11-17' }], '2026-11-17')).toBe('2026-11-18');
    expect(suggestValidFrom([{ validFrom: '2027-01-01' }, { validFrom: '2026-01-01' }], '2026-11-17')).toBe('2027-01-02');
    expect(suggestValidFrom([], '2026-11-17')).toBe('2026-11-17');
  });
});

describe('publish', () => {
  it('says which version it ends (v4 ends v3 on 31 Dec 2026) and what a published version means', () => {
    const s = publishSummary(timesheet, 4);
    expect(s.ok).toBe(true);
    expect(s.text).toMatch(/^Publishing v4 will end v3 on 31 Dec 2026\. v4 is valid from 01 Jan 2027\./);
    expect(s.text).toMatch(/cannot be changed.*create a new version/);
  });
  it('a first version says only when it starts; a published or missing version cannot be published', () => {
    const first = { ...timesheet, versions: [{ ...timesheet.versions[3]!, versionNo: 1 }] };
    expect(publishSummary(first, 1).text).toMatch(/^Publishing v1 makes it valid from 01 Jan 2027\./);
    expect(publishSummary(timesheet, 3)).toMatchObject({ ok: false, text: 'v3 is already published.' });
    expect(publishSummary(timesheet, 9).ok).toBe(false);
  });
  it('an unfinished flow is not published: the reason comes from the flow validation', () => {
    let d = addStep(emptyDefinition(), 'input_file', { x: 0, y: 0 }).definition;
    d = addStep(d, 'filter', { x: 0, y: 96 }).definition;
    expect(publishBlockers(d)).toMatch(/Filter|input/i);
    const c = connectSteps(d, { source: 'input_file-1', sourceHandle: null, target: 'filter-1', targetHandle: null });
    expect(c.ok && publishBlockers(c.definition)).toBeUndefined();
  });
});
