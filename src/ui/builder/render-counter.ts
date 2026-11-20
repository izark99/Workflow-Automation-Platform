// Render counters for `npm run perf:canvas` (task T6.1). They exist only in a build made with VITE_PERF_COUNTERS=true;
// in the release build `PERF_COUNTERS` is the constant `false` and the calls do nothing.

const PERF_COUNTERS = import.meta.env.VITE_PERF_COUNTERS === 'true';

type Holder = { __dfwRenders?: Record<string, number> };
const holder = (): Holder => globalThis as unknown as Holder;

/** Counts one render of a part. `enabled` is only for the unit test. */
export function countRender(part: string, enabled: boolean = PERF_COUNTERS): void {
  if (!enabled) return;
  const counts = (holder().__dfwRenders ??= {});
  counts[part] = (counts[part] ?? 0) + 1;
}

export function readRenderCounts(): Record<string, number> {
  return { ...(holder().__dfwRenders ?? {}) };
}

export function resetRenderCounts(): void {
  holder().__dfwRenders = {};
}
