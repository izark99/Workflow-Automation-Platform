/** Where the time of the last activity is kept, so several tabs of one browser share it (SPEC 12.2 item 2). */
export const LAST_ACTIVITY_KEY = 'dfw.lastActivity';

export type IdleStatus = { kind: 'active' } | { kind: 'warning'; remainingMs: number } | { kind: 'expired' };

/**
 * What the session needs now. `warnMs` is how long before the limit the dialog shows (2 minutes). A last activity in the
 * future (the clock was set back) counts as now, so a clock that jumps never signs anyone out by itself.
 */
export function idleStatus(now: number, lastActivity: number, limitMs: number, warnMs: number): IdleStatus {
  const last = Math.min(lastActivity, now);
  const remainingMs = last + limitMs - now;
  if (remainingMs <= 0) return { kind: 'expired' };
  if (remainingMs <= warnMs) return { kind: 'warning', remainingMs };
  return { kind: 'active' };
}

/**
 * Reads the stored time. A missing, broken or negative value is "now" (a person is here and the tracker has not written
 * yet); a value in the future is clamped to now. Only a real old time can end a session.
 */
export function parseLastActivity(raw: string | null | undefined, now: number): number {
  if (raw === null || raw === undefined || raw.trim() === '') return now;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return now;
  return Math.min(n, now);
}

/** The text "mm:ss" for a countdown. */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
