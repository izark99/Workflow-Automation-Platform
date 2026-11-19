import { LAST_ACTIVITY_KEY, parseLastActivity } from './idle-status';

/** What counts as activity (SPEC 12.2 item 2). `focus` is the window getting focus. */
export const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'wheel', 'touchstart', 'focus'] as const;
/** The time is written to storage at most this often. */
export const WRITE_THROTTLE_MS = 5000;
/** A hold that is never released stops counting after this long, so a lost release cannot keep a session open forever. */
export const MAX_HOLD_MS = 4 * 60 * 60 * 1000;

export interface Listenable {
  addEventListener(type: string, listener: (event: { key?: string | null; newValue?: string | null }) => void, options?: boolean | { capture?: boolean; passive?: boolean }): void;
  removeEventListener(type: string, listener: (event: { key?: string | null; newValue?: string | null }) => void, options?: boolean | { capture?: boolean }): void;
}

export interface HoldRegistry {
  /** A running flow calls this and keeps the function it returns. The release is safe to call twice. */
  hold(): () => void;
  /** True while at least one hold that is not too old exists. */
  active(): boolean;
}

export function createHoldRegistry(now: () => number, maxHoldMs: number = MAX_HOLD_MS): HoldRegistry {
  const started = new Map<number, number>();
  let next = 0;
  return {
    hold() {
      const id = next++;
      started.set(id, now());
      return () => void started.delete(id);
    },
    active() {
      const t = now();
      for (const at of started.values()) if (t - at < maxHoldMs) return true;
      return false;
    },
  };
}

export interface ActivityTracker {
  /** A person did something. The storage write is throttled; `force` writes at once ("Stay signed in"). */
  touch(force?: boolean): void;
  /** The time of the last activity: now while a hold exists, else the newest of this tab and the other tabs. */
  last(): number;
  holds: HoldRegistry;
  stop(): void;
}

export interface TrackerOptions {
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  /** Receives the pointer, key, scroll, wheel, touch and focus events (the window). */
  events: Listenable | undefined;
  /** Receives the `storage` event that another tab causes (the window). */
  storageEvents?: Listenable | undefined;
  now: () => number;
  throttleMs?: number;
  maxHoldMs?: number;
}

export function createActivityTracker(options: TrackerOptions): ActivityTracker {
  const { storage, events, now } = options;
  const throttleMs = options.throttleMs ?? WRITE_THROTTLE_MS;
  const holds = createHoldRegistry(now, options.maxHoldMs);

  const read = (): number => {
    try {
      return parseLastActivity(storage?.getItem(LAST_ACTIVITY_KEY), now());
    } catch {
      return now(); // blocked storage: this tab still tracks its own activity in memory
    }
  };
  let last = read();
  let lastWrite = Number.NEGATIVE_INFINITY;

  const write = (t: number): void => {
    lastWrite = t;
    try {
      storage?.setItem(LAST_ACTIVITY_KEY, String(t));
    } catch {
      // Not remembered across tabs; this tab still works.
    }
  };
  const touch = (force = false): void => {
    const t = now();
    last = t;
    if (force || t - lastWrite >= throttleMs) write(t);
  };
  const onActivity = (): void => touch();
  const onStorage = (e: { key?: string | null; newValue?: string | null }): void => {
    if (e.key !== LAST_ACTIVITY_KEY) return;
    // Another tab saw activity. Only a newer time counts; an older value (a stale write) must not shorten the session.
    last = Math.max(last, parseLastActivity(e.newValue, now()));
  };

  const options2 = { capture: true, passive: true };
  for (const type of ACTIVITY_EVENTS) events?.addEventListener(type, onActivity, options2);
  options.storageEvents?.addEventListener('storage', onStorage);

  return {
    touch,
    last: () => (holds.active() ? now() : last),
    holds,
    stop() {
      for (const type of ACTIVITY_EVENTS) events?.removeEventListener(type, onActivity, options2);
      options.storageEvents?.removeEventListener('storage', onStorage);
    },
  };
}
