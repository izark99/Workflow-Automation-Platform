import { useEffect } from 'react';
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
