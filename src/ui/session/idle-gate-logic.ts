import { DEFAULT_IDLE_TIMEOUT_HOURS } from '../../store/types';

export const HOUR_MS = 3_600_000;
/** The dialog shows this long before the limit (SPEC 12.2 item 3). */
export const WARN_MS = 120_000;
/** The limit is read after sign-in and again this often (SPEC 12.2 item 5). */
export const LIMIT_POLL_MS = 15 * 60_000;

export interface IdleLimit {
  limitMs: number;
  warnMs: number;
  /** The limit in hours, for the message on the sign-in screen. */
  hours: number;
}

/** The limit from the hours that the admin set. A development hook can give a shorter limit in milliseconds (`dfw.idleMs`). */
export function idleLimit(hours: number | undefined, hookMs?: number): IdleLimit {
  const h = hours ?? DEFAULT_IDLE_TIMEOUT_HOURS;
  if (hookMs !== undefined && Number.isFinite(hookMs) && hookMs > 0) return { limitMs: hookMs, warnMs: Math.min(WARN_MS, Math.floor(hookMs / 2)), hours: h };
  return { limitMs: h * HOUR_MS, warnMs: WARN_MS, hours: h };
}

/**
 * What a screen reader hears. The countdown is announced once a minute and at 10 seconds, never every second.
 * Returns the whole seconds left when this second is one of those moments, else null.
 */
export function announceAt(remainingMs: number): number | null {
  const s = Math.ceil(remainingMs / 1000);
  if (s <= 0) return null;
  if (s === 10) return s;
  return s % 60 === 0 ? s : null;
}
