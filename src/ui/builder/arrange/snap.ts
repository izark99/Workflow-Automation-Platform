import { useCallback, useState } from 'react';

/** The grid of "Snap to grid" in px (SPEC 15.1). */
export const SNAP_GRID = 8;
const KEY = 'dfw.snapToGrid';

/** The switch is kept per user in this browser. Storage can be blocked, so every access is guarded. */
export function readSnap(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useSnap(): [boolean, () => void] {
  const [on, setOn] = useState(readSnap);
  const toggle = useCallback(() => {
    setOn((v) => {
      try {
        localStorage.setItem(KEY, v ? '0' : '1');
      } catch {
        /* the switch still works for this visit */
      }
      return !v;
    });
  }, []);
  return [on, toggle];
}
