import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_EVENTS, MAX_HOLD_MS, WRITE_THROTTLE_MS, createActivityTracker, createHoldRegistry } from './activity-tracker';
import type { Listenable } from './activity-tracker';
import { LAST_ACTIVITY_KEY } from './idle-status';

afterEach(() => vi.useRealTimers());

/** A window stand-in: listeners by type, and a way to fire an event. */
function fakeWindow() {
  const listeners = new Map<string, Set<(e: { key?: string | null; newValue?: string | null }) => void>>();
  const target: Listenable & { fire(type: string, e?: { key?: string | null; newValue?: string | null }): void; count(): number } = {
    addEventListener: (type, fn) => void (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn),
    removeEventListener: (type, fn) => void listeners.get(type)?.delete(fn),
    fire: (type, e = {}) => listeners.get(type)?.forEach((fn) => fn(e)),
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
  return target;
}
function memory(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(LAST_ACTIVITY_KEY, initial);
  const writes: string[] = [];
  return { data, writes, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => (writes.push(v), void data.set(k, v)) };
}

describe('activity tracker', () => {
  it('listens to pointer, key, scroll, wheel, touch and focus events, and stops listening', () => {
    expect(ACTIVITY_EVENTS).toEqual(['pointerdown', 'pointermove', 'keydown', 'scroll', 'wheel', 'touchstart', 'focus']);
    const win = fakeWindow();
    const tracker = createActivityTracker({ storage: memory(), events: win, storageEvents: win, now: () => 0 });
    expect(win.count()).toBe(ACTIVITY_EVENTS.length + 1);
    tracker.stop();
    expect(win.count()).toBe(0);
  });

  it('writes the time at most every 5 seconds, but keeps the newest time in memory', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const win = fakeWindow();
    const store = memory();
    const tracker = createActivityTracker({ storage: store, events: win, now: () => Date.now() });
    win.fire('keydown');
    expect(store.writes).toEqual(['100000']);
    vi.setSystemTime(102_000);
    win.fire('pointermove');
    win.fire('scroll');
    expect(store.writes).toEqual(['100000']);
    expect(tracker.last()).toBe(102_000);
    vi.setSystemTime(100_000 + WRITE_THROTTLE_MS);
    win.fire('wheel');
    expect(store.writes).toEqual(['100000', String(100_000 + WRITE_THROTTLE_MS)]);
  });

  it('"Stay signed in" forces a write inside the throttle window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const store = memory();
    const tracker = createActivityTracker({ storage: store, events: fakeWindow(), now: () => Date.now() });
    tracker.touch();
    vi.setSystemTime(11_000);
    tracker.touch(true);
    expect(store.writes).toEqual(['10000', '11000']);
  });

  it('starts from the time that another tab or an earlier visit wrote', () => {
    const tracker = createActivityTracker({ storage: memory('4000'), events: fakeWindow(), now: () => 9000 });
    expect(tracker.last()).toBe(4000);
  });

  it('two tabs: a newer time from the storage event counts, an older one does not shorten the session', () => {
    const win = fakeWindow();
    let t = 10_000;
    const tracker = createActivityTracker({ storage: memory('10000'), events: win, storageEvents: win, now: () => t });
    t = 50_000;
    win.fire('storage', { key: LAST_ACTIVITY_KEY, newValue: '40000' });
    expect(tracker.last()).toBe(40_000);
    win.fire('storage', { key: LAST_ACTIVITY_KEY, newValue: '20000' });
    expect(tracker.last()).toBe(40_000);
    win.fire('storage', { key: 'dfw.theme', newValue: '49000' });
    expect(tracker.last()).toBe(40_000);
  });

  it('a broken stored value is now, a future value is clamped, and a clock that jumps back keeps the last time', () => {
    expect(createActivityTracker({ storage: memory('garbage'), events: fakeWindow(), now: () => 7000 }).last()).toBe(7000);
    expect(createActivityTracker({ storage: memory('999999'), events: fakeWindow(), now: () => 7000 }).last()).toBe(7000);
  });

  it('storage that throws still tracks in memory', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    let t = 1000;
    const win = fakeWindow();
    const tracker = createActivityTracker({ storage: broken, events: win, now: () => t });
    t = 2000;
    expect(() => win.fire('keydown')).not.toThrow();
    expect(tracker.last()).toBe(2000);
  });
});

describe('hold registry (a run in progress counts as activity)', () => {
  it('counts while a hold exists and stops after the release', () => {
    const holds = createHoldRegistry(() => 0);
    expect(holds.active()).toBe(false);
    const release = holds.hold();
    expect(holds.active()).toBe(true);
    release();
    expect(holds.active()).toBe(false);
  });
  it('two holds need two releases; a release twice does no harm', () => {
    const holds = createHoldRegistry(() => 0);
    const a = holds.hold();
    const b = holds.hold();
    a();
    a();
    expect(holds.active()).toBe(true);
    b();
    expect(holds.active()).toBe(false);
  });
  it('a hold that is never released is not forever', () => {
    let t = 0;
    const holds = createHoldRegistry(() => t);
    holds.hold();
    t = MAX_HOLD_MS - 1;
    expect(holds.active()).toBe(true);
    t = MAX_HOLD_MS;
    expect(holds.active()).toBe(false);
  });
  it('the tracker reports now while a run holds, and the stored time after it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const tracker = createActivityTracker({ storage: memory('1000'), events: fakeWindow(), now: () => Date.now() });
    const release = tracker.holds.hold();
    vi.setSystemTime(60_000);
    expect(tracker.last()).toBe(60_000);
    release();
    expect(tracker.last()).toBe(1000);
  });
});
