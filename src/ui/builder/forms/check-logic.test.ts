import { describe, expect, it } from 'vitest';
import { checkFromSettings, checkMissing, checkToSettings, emptyRule } from './check-logic';

describe('Check form logic', () => {
  it('reads the rules and stop, and defaults to none and off', () => {
    expect(checkFromSettings({})).toEqual({ rules: [], stop: false });
    expect(checkFromSettings({ rules: [{ name: 'A', condition: 'TRUE', message: 'm' }, null], stop: true })).toEqual({ rules: [{ name: 'A', condition: 'TRUE', message: 'm' }, { name: '', condition: '', message: '' }], stop: true });
  });
  it('keeps every rule as typed, also an unfinished one, and other settings', () => {
    const v = { rules: [emptyRule(), { name: 'B', condition: '[X] > 1', message: 'x' }], stop: false };
    expect(checkToSettings(v, { other: 1 })).toEqual({ other: 1, rules: [{ name: '', condition: '', message: '' }, { name: 'B', condition: '[X] > 1', message: 'x' }], stop: false });
  });
  it('says what is missing, with the number of the rule', () => {
    expect(checkMissing({ rules: [], stop: false })).toEqual(['Add at least one rule.']);
    expect(checkMissing({ rules: [emptyRule()], stop: false })).toEqual(['Rule 1 needs a name.', 'Rule 1 needs a condition.', 'Rule 1 needs a message.']);
    expect(checkMissing({ rules: [{ name: 'A', condition: 'TRUE', message: 'm' }, { name: 'A', condition: 'TRUE', message: 'm' }], stop: false })).toEqual(['The rule name A is used twice.']);
    expect(checkMissing({ rules: [{ name: 'A', condition: 'TRUE', message: 'm' }], stop: true })).toEqual([]);
  });
});
