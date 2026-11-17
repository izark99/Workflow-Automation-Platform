import { describe, expect, it } from 'vitest';
import { seedSnapshot } from '../../store/seed';
import type { FlowRecord, User } from '../../store/types';
import { canDeleteFlow, canRunFlow, countSteps, describeRange, describeSteps, filterFlows, todayIso, versionInEffect, versionToOpen } from './flows-logic';

const flows = seedSnapshot().flows.filter((f) => !f.deletedAt);
const byId = (id: string): FlowRecord => flows.find((f) => f.id === id)!;
const users = seedSnapshot().users;
const user = (id: string): User => users.find((u) => u.id === id)!;

describe('versions of a flow', () => {
  it('finds the published version that covers a day, with inclusive ends', () => {
    const f = byId('flow-timesheet');
    expect(versionInEffect(f, '2026-11-17')?.versionNo).toBe(3);
    expect(versionInEffect(f, '2026-06-30')?.versionNo).toBe(2);
    expect(versionInEffect(f, '2026-07-01')?.versionNo).toBe(3);
    expect(versionInEffect(f, '2025-12-31')).toBeUndefined();
  });
  it('ignores a draft even when its dates cover the day', () => {
    expect(versionInEffect(byId('flow-timesheet'), '2027-02-01')?.versionNo).toBe(3);
    expect(versionInEffect(byId('flow-insurance'), '2026-11-17')).toBeUndefined();
  });
  it('Open shows the version in effect, else the newest version', () => {
    expect(versionToOpen(byId('flow-timesheet'), '2026-11-17')?.versionNo).toBe(3);
    expect(versionToOpen(byId('flow-insurance'), '2026-11-17')?.versionNo).toBe(1);
    expect(versionToOpen(byId('flow-timesheet'), '2020-01-01')?.versionNo).toBe(4);
  });
});

describe('texts', () => {
  it('describes the range as the screens do', () => {
    const f = byId('flow-ot-department');
    expect(describeRange(f.versions[1])).toBe('From 01 Jul 2026');
    expect(describeRange(f.versions[0])).toBe('01 Jan 2026 to 30 Jun 2026');
    expect(describeRange(byId('flow-insurance').versions[0])).toBe('Not published yet');
    expect(describeRange(undefined)).toBe('Not published yet');
  });
  it('counts steps and output nodes from the definition', () => {
    const def = { nodes: [{ type: 'input_file' }, { type: 'filter' }, { type: 'output' }, { type: 'output' }] };
    expect(countSteps(def)).toEqual({ steps: 4, outputs: 2 });
    expect(describeSteps(def)).toBe('4 steps, 2 output sheets');
    expect(describeSteps({ nodes: [{ type: 'output' }] })).toBe('1 step, 1 output sheet');
    expect(describeSteps(null)).toBe('0 steps, 0 output sheets');
  });
  it('writes the local date as ISO text', () => {
    expect(todayIso(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
});

describe('filter and rights', () => {
  it('filters by scope and by name, ignoring case and spaces around the text', () => {
    expect(filterFlows(flows, 'all', '').length).toBe(4);
    expect(filterFlows(flows, 'personal', '').map((f) => f.id)).toEqual(['flow-ot-department', 'flow-insurance']);
    expect(filterFlows(flows, 'shared', '').length).toBe(2);
    expect(filterFlows(flows, 'all', '  OT BY ').map((f) => f.id)).toEqual(['flow-ot-department']);
    expect(filterFlows(flows, 'shared', 'ot by')).toEqual([]);
  });
  it('the admin deletes any flow; a user only a personal flow of their own', () => {
    expect(canDeleteFlow(user('user-harold'), byId('flow-insurance'))).toBe(true);
    expect(canDeleteFlow(user('user-minh'), byId('flow-insurance'))).toBe(true);
    expect(canDeleteFlow(user('user-lan'), byId('flow-insurance'))).toBe(false);
    expect(canDeleteFlow(user('user-lan'), byId('flow-timesheet'))).toBe(false);
  });
  it('a flow can be run only when a version is published', () => {
    expect(canRunFlow(byId('flow-timesheet'))).toBe(true);
    expect(canRunFlow(byId('flow-insurance'))).toBe(false);
  });
});
