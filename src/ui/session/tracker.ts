import { useEffect } from 'react';
import { createActivityTracker } from './activity-tracker';
import type { ActivityTracker } from './activity-tracker';

let shared: ActivityTracker | undefined;

/** The one tracker of this page. It listens to the window and keeps the time in localStorage (SPEC 12.2). */
export function activityTracker(): ActivityTracker {
  shared ??= createActivityTracker({
    storage: typeof localStorage === 'undefined' ? undefined : localStorage,
    events: typeof window === 'undefined' ? undefined : window,
    storageEvents: typeof window === 'undefined' ? undefined : window,
    now: () => Date.now(),
  });
  return shared;
}

/** A flow run in progress counts as activity for as long as `active` is true, and not after the screen is gone. */
export function holdActivity(): () => void {
  return activityTracker().holds.hold();
}

export function useHoldActivity(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    return holdActivity();
  }, [active]);
}
