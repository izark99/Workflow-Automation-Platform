import { describe, expect, it } from 'vitest';
import { HOUR_MS, WARN_MS, announceAt, idleLimit } from './idle-gate-logic';

describe('idleLimit', () => {
  it('uses the hours of the admin, and 8 when none is read', () => {
    expect(idleLimit(12)).toEqual({ limitMs: 12 * HOUR_MS, warnMs: WARN_MS, hours: 12 });
    expect(idleLimit(undefined)).toEqual({ limitMs: 8 * HOUR_MS, warnMs: WARN_MS, hours: 8 });
  });
  it('a development limit in milliseconds replaces the hours, and the warning stays inside it', () => {
    expect(idleLimit(8, 20_000)).toEqual({ limitMs: 20_000, warnMs: 10_000, hours: 8 });
    expect(idleLimit(8, 600_000)).toEqual({ limitMs: 600_000, warnMs: WARN_MS, hours: 8 });
  });
  it('ignores a hook that is not a positive number', () => {
    for (const bad of [0, -1, Number.NaN]) expect(idleLimit(8, bad).limitMs).toBe(8 * HOUR_MS);
  });
});

describe('announceAt', () => {
  it('announces at 2:00, 1:00 and 0:10, not every second', () => {
    expect(announceAt(120_000)).toBe(120);
    expect(announceAt(119_000)).toBeNull();
    expect(announceAt(60_000)).toBe(60);
    expect(announceAt(10_000)).toBe(10);
    expect(announceAt(9_000)).toBeNull();
    expect(announceAt(61_000)).toBeNull();
  });
  it('does not announce at zero or below', () => {
    expect(announceAt(0)).toBeNull();
    expect(announceAt(-5)).toBeNull();
  });
});
