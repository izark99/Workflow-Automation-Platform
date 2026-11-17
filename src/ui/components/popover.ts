import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** Closes a popover on a click outside of `ref`. */
export function useOutsideClose(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, open, close]);
}

/** True when the popover does not fit below its anchor, so it should open upward. */
export function useOpensUp(anchor: RefObject<HTMLElement | null>, open: boolean, popoverHeight: number): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const room = window.innerHeight - r.bottom;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the position depends on the measured anchor, which exists only after layout
    setUp(room < popoverHeight + 8 && r.top > room);
  }, [anchor, open, popoverHeight]);
  return up;
}
