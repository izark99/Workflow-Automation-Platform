import { useEffect } from 'react';
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
