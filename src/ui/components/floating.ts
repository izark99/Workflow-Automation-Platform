import { useCallback, useLayoutEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

interface Placement {
  top: number;
  left: number;
  /** The width of the anchor, for a list that is as wide as its button. */
  anchorWidth: number;
  /** The tallest the popover may be: a long list scrolls inside it instead of running past the window. */
  maxHeight: number;
}

const MARGIN = 8;

/**
 * Where a popover goes. The popover is drawn in a layer on `document.body` with `position: fixed`, so no container with
 * `overflow` (a table that scrolls, a card, the settings panel) can cut it off. It opens below its anchor, or above when
 * there is not enough room below, and is kept inside the window on every side. It is placed again when the window is
 * resized, when anything scrolls, and after every render (a calendar changes height when the month changes).
 * `align: 'end'` lines the popover up with the right edge of the anchor.
 */
export function useFloating(anchorRef: RefObject<HTMLElement | null>, popRef: RefObject<HTMLElement | null>, open: boolean, options: { gap?: number; align?: 'start' | 'end' } = {}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const gap = options.gap ?? 4;
  const align = options.align ?? 'start';

  const place = useCallback((): void => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const a = anchor.getBoundingClientRect();
    const width = pop.offsetWidth;
    // The height the list would have with no limit (scrollHeight does not include the 1 px borders).
    const natural = pop.scrollHeight + 2;
    const spaceBelow = window.innerHeight - a.bottom - gap - MARGIN;
    const spaceAbove = a.top - gap - MARGIN;
    const up = natural > spaceBelow && spaceAbove > spaceBelow;
    const window_ = window.innerHeight - 2 * MARGIN;
    // On the side with more room, and never less than 160 px unless the window itself is shorter.
    const maxHeight = Math.min(window_, Math.max(up ? spaceAbove : spaceBelow, Math.min(160, window_)));
    const height = Math.min(natural, maxHeight);
    const wantedTop = up ? a.top - gap - height : a.bottom + gap;
    const top = Math.max(MARGIN, Math.min(wantedTop, window.innerHeight - height - MARGIN));
    const wantedLeft = align === 'end' ? a.right - width : a.left;
    const left = Math.max(MARGIN, Math.min(wantedLeft, window.innerWidth - width - MARGIN));
    setPlacement((p) => (p && p.top === top && p.left === left && p.anchorWidth === a.width && p.maxHeight === maxHeight ? p : { top, left, anchorWidth: a.width, maxHeight }));
  }, [anchorRef, popRef, gap, align]);

  // Before the browser paints, so the popover never shows at a wrong place first.
  useLayoutEffect(() => {
    if (open) place();
  });
  useLayoutEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true); // capture: a scroll in any container moves the anchor
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  // Before the first placement the popover is invisible but real (not `visibility: hidden`), so that the list can take focus.
  // A placement kept from an earlier opening is replaced before the browser paints (the layout effect above).
  const style: CSSProperties = open && placement ? { position: 'fixed', top: placement.top, left: placement.left, maxHeight: placement.maxHeight, overflowY: 'auto' } : { position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none' };
  return { style, anchorWidth: placement?.anchorWidth ?? 0 };
}

/** The layer that popovers are drawn in, or null when there is no document (a render to a string in a unit test). */
export const popoverLayer = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.body);
