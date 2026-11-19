import { describe, expect, it } from 'vitest';
import type { FlowParameter } from '../engine/flow/parameters';
import { initialValues, parameterValueErrors } from './parameter-logic';

const date: FlowParameter = { key: 'cutoff', label: 'Cut-off', type: 'date', required: true, default: '2026-09-30' };
const team: FlowParameter = { key: 'team', label: 'Team', type: 'list', required: true, options: ['A', 'B'] };
const note: FlowParameter = { key: 'note', label: 'Note', type: 'text', required: false };

describe('parameter-logic', () => {
  it('fills the form with the defaults, and a given value wins', () => {
    expect(initialValues([date, team])).toEqual({ cutoff: '2026-09-30', team: undefined });
    expect(initialValues([date], { cutoff: '2026-10-31' })).toEqual({ cutoff: '2026-10-31' });
  });

  it('gives one error per invalid parameter and none for a valid one', () => {
    const e = parameterValueErrors([date, team, note], { cutoff: '2026-09-30', team: undefined });
    expect(Object.keys(e)).toEqual(['team']);
    expect(e.team).toMatch(/team/);
    expect(parameterValueErrors([team], { team: 'C' }).team).toMatch(/A, B/);
    expect(parameterValueErrors([date, team, note], { cutoff: '2026-09-30', team: 'A' })).toEqual({});
  });
});
