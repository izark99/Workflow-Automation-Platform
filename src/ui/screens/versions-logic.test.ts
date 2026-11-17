import { describe, expect, it } from 'vitest';
import { seedSnapshot } from '../../store/seed';
import type { FlowVersionRecord } from '../../store/types';
import { dateCheck, newVersionProblem, stateText, suggestStart, timeline, timelineNote, versionState } from './versions-logic';

const flow = seedSnapshot().flows.find((f) => f.id === 'flow-timesheet')!;
const v = flow.versions;
const TODAY = '2026-11-17';
const mk = (versionNo: number, validFrom: string, validTo: string | null, status: 'draft' | 'published' = 'published'): FlowVersionRecord => ({ versionNo, validFrom, validTo, status, changeNote: '', definition: {} });

describe('version states', () => {
  it('draft, in effect, ended, and published but not started', () => {
    expect(v.map((x) => stateText(versionState(x, TODAY)))).toEqual(['Published, ended', 'Published, ended', 'Published, in effect', 'Draft']);
    expect(versionState(mk(5, '2027-03-01', null), TODAY)).toBe('upcoming');
    expect(versionState(mk(6, '2026-01-01', '2026-11-17'), TODAY)).toBe('in_effect'); // the end day counts
  });
});

describe('timeline', () => {
  it('orders by start, titles as the design does, and sizes by range', () => {
    const t = timeline(v, TODAY);
    expect(t.map((s) => [s.title, s.sub])).toEqual([
      ['v1', 'Jan to Mar 2026'],
      ['v2', 'Apr to Jun 2026'],
      ['v3, in effect', 'From Jul 2026, no end date'],
      ['v4, draft', 'From Jan 2027'],
    ]);
    expect(t.map((s) => s.axis)).toEqual(['Jan 2026', 'Apr 2026', 'Jul 2026', 'Jan 2027']);
    expect(t[0]!.weight).toBe(90);
    expect(t[2]!.weight).toBe(120);
  });
  it('a very short version keeps a readable width', () => {
    expect(timeline([mk(1, '2026-01-01', '2026-01-03')], TODAY)[0]!.weight).toBe(30);
  });
});

describe('date check', () => {
  it('names the version a run uses (15 May 2026 uses v2) and ignores drafts', () => {
    expect(dateCheck(v, '2026-05-15')).toEqual({ version: 2, text: 'A run with effective date 15 May 2026 uses v2.' });
    expect(dateCheck(v, '2027-02-01').version).toBe(3);
    expect(dateCheck(v, '2026-06-30').version).toBe(2);
    expect(dateCheck(v, '2026-07-01').version).toBe(3);
  });
  it('a date no version covers says what happens and what to do', () => {
    const r = dateCheck(v, '2025-12-31');
    expect(r.version).toBeUndefined();
    expect(r.text).toMatch(/stops with an error.*Choose a date inside a version/);
    expect(dateCheck([mk(1, '2026-01-01', null, 'draft')], '2026-05-01').text).toMatch(/No version is published.*Publish a version first/);
  });
});

describe('note under the timeline', () => {
  it('says what publishing the draft does', () => {
    expect(timelineNote(v, 'F')).toEqual({ text: 'Versions cannot overlap. Publishing v4 will end v3 on 31 Dec 2026.', problem: false });
  });
  it('gives the rule when there is no draft, and a problem when versions overlap', () => {
    expect(timelineNote(v.filter((x) => x.status === 'published'), 'F').problem).toBe(false);
    const bad = timelineNote([mk(1, '2026-01-01', '2026-06-30'), mk(2, '2026-06-01', null)], 'F');
    expect(bad.problem).toBe(true);
    expect(bad.text).toMatch(/v1 and v2 share a day/);
    expect(timelineNote([mk(1, '2026-01-01', null), mk(2, '2025-01-01', null, 'draft')], 'F').problem).toBe(true);
  });
});

describe('start of a new version', () => {
  it('refuses a day inside a closed version, or not after an open one, and says what to do', () => {
    expect(newVersionProblem(v, '2026-05-01')).toBe('01 May 2026 is inside v2 (01 Apr 2026 to 30 Jun 2026). Choose a day after 30 Jun 2026.');
    expect(newVersionProblem(v, '2026-07-01')).toMatch(/v3 starts on 01 Jul 2026.*Choose a day after 01 Jul 2026/);
    expect(newVersionProblem(v, '2026-03-31')).toMatch(/inside v1/);
  });
  it('accepts a day after the last published start', () => {
    expect(newVersionProblem(v, '2026-07-02')).toBeUndefined();
    expect(newVersionProblem(v, '2027-01-01')).toBeUndefined();
    expect(newVersionProblem([], '2026-01-01')).toBeUndefined();
  });
  it('suggests today, or the day after the latest published start or end', () => {
    expect(suggestStart(v, TODAY)).toBe(TODAY);
    expect(suggestStart([mk(1, '2026-11-17', null)], TODAY)).toBe('2026-11-18');
    expect(suggestStart([mk(1, '2026-01-01', '2026-12-31')], TODAY)).toBe('2027-01-01');
    expect(suggestStart([], TODAY)).toBe(TODAY);
  });
});
