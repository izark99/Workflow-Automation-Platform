import { describe, expect, it } from 'vitest';
import { canSaveHours, parseHours } from './admin-settings-logic';

describe('parseHours', () => {
  it('accepts whole numbers from 1 to 72, with spaces around', () => {
    expect(parseHours('1')).toEqual({ ok: true, value: 1 });
    expect(parseHours(' 8 ')).toEqual({ ok: true, value: 8 });
    expect(parseHours('72')).toEqual({ ok: true, value: 72 });
    expect(parseHours('08')).toEqual({ ok: true, value: 8 });
  });
  it('says what is wrong: empty, not a whole number, out of range', () => {
    expect(parseHours('')).toEqual({ ok: false, error: 'admin.settings.hoursEmpty' });
    expect(parseHours('   ')).toEqual({ ok: false, error: 'admin.settings.hoursEmpty' });
    for (const bad of ['1.5', '1,5', 'abc', '-3', '8h', '1e1', '+8']) expect(parseHours(bad), bad).toEqual({ ok: false, error: 'admin.settings.hoursWhole' });
    for (const bad of ['0', '73', '100', '00']) expect(parseHours(bad), bad).toEqual({ ok: false, error: 'admin.settings.hoursRange' });
  });
});

describe('canSaveHours', () => {
  it('is true only for a valid value that changed', () => {
    expect(canSaveHours('12', 8)).toBe(true);
    expect(canSaveHours('8', 8)).toBe(false);
    expect(canSaveHours(' 8 ', 8)).toBe(false);
    expect(canSaveHours('0', 8)).toBe(false);
    expect(canSaveHours('', 8)).toBe(false);
    expect(canSaveHours('1.5', 8)).toBe(false);
  });
});
