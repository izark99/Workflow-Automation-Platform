import { describe, expect, it } from 'vitest';
import { formatCountdown, idleStatus, parseLastActivity } from './idle-status';

const H = 3_600_000;
const WARN = 120_000;

describe('idleStatus', () => {
  it('is active well before the limit', () => {
    expect(idleStatus(1000, 1000, 8 * H, WARN)).toEqual({ kind: 'active' });
    expect(idleStatus(8 * H - WARN - 1, 0, 8 * H, WARN)).toEqual({ kind: 'active' });
  });
  it('warns with the time left in the last 2 minutes', () => {
    expect(idleStatus(8 * H - WARN, 0, 8 * H, WARN)).toEqual({ kind: 'warning', remainingMs: WARN });
    expect(idleStatus(8 * H - 1000, 0, 8 * H, WARN)).toEqual({ kind: 'warning', remainingMs: 1000 });
  });
  it('is expired at the limit and after it', () => {
    expect(idleStatus(8 * H, 0, 8 * H, WARN)).toEqual({ kind: 'expired' });
    expect(idleStatus(9 * H, 0, 8 * H, WARN)).toEqual({ kind: 'expired' });
  });
  it('a clock that jumps back does not end the session: a last activity in the future counts as now', () => {
    expect(idleStatus(1000, 9 * H, 8 * H, WARN)).toEqual({ kind: 'active' });
  });
  it('a clock that jumps forward past the limit expires it', () => {
    expect(idleStatus(100 * H, 0, 8 * H, WARN)).toEqual({ kind: 'expired' });
  });
  it('works for a short limit (the development hook)', () => {
    expect(idleStatus(7000, 0, 10_000, 4000)).toEqual({ kind: 'warning', remainingMs: 3000 });
    expect(idleStatus(5000, 0, 10_000, 4000)).toEqual({ kind: 'active' });
  });
});

describe('parseLastActivity', () => {
  it('reads a stored time', () => {
    expect(parseLastActivity('500', 1000)).toBe(500);
  });
  it('a missing or broken value is now', () => {
    for (const raw of [null, undefined, '', '  ', 'abc', 'NaN', 'Infinity', '-5', '{"a":1}']) expect(parseLastActivity(raw, 1000), String(raw)).toBe(1000);
  });
  it('a value in the future is clamped to now', () => {
    expect(parseLastActivity('5000', 1000)).toBe(1000);
  });
});

describe('formatCountdown', () => {
  it('writes mm:ss and rounds up so the last second shows 00:01', () => {
    expect(formatCountdown(120_000)).toBe('02:00');
    expect(formatCountdown(65_400)).toBe('01:06');
    expect(formatCountdown(500)).toBe('00:01');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5)).toBe('00:00');
  });
});
