import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Closes a popover on a click outside of `refs`. The popover is drawn in a layer on `document.body`, outside the element
 * of its button, so both the button's element and the popover are listed: a click on either is not "outside".
 */
export function useOutsideClose(refs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[], open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const list = Array.isArray(refs) ? refs : [refs];
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      const inside = list.some((r) => r.current?.contains(e.target as Node));
      if (!inside) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // `refs` may be a new array on every render; the refs inside are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);
}

/**
 * True when the popover does not fit below its anchor, so it should open upward. It is measured in the click handler,
 * before the first render: if the popover first opened downward and flipped later, its focus would scroll the page.
 */
export function opensUp(anchor: HTMLElement | null, popoverHeight: number): boolean {
  if (!anchor) return false;
  const r = anchor.getBoundingClientRect();
  const room = window.innerHeight - r.bottom;
  return room < popoverHeight + 8 && r.top > room;
}

/**
 * Keeps a popover in the page for `exitMs` after it closes, so it can play its exit animation (Harold: 200 ms to open, 120 ms
 * to close). `mounted` is true while it is open or leaving; `leaving` is true only while it leaves.
 */
export function usePresence(open: boolean, exitMs = 120): { mounted: boolean; leaving: boolean } {
  const [exiting, setExiting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Adjusted while rendering (not in an effect), so there is no frame in which the popover is gone before it leaves.
  if (open !== wasOpen) {
    setWasOpen(open);
    setExiting(!open);
  }
  useEffect(() => {
    if (!exiting) return undefined;
    const timer = window.setTimeout(() => setExiting(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [exiting, exitMs]);
  return { mounted: open || exiting, leaving: !open && exiting };
}
