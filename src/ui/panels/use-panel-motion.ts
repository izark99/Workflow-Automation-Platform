import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Sets `data-moving` on a panel while its width changes, so that its glass can drop the blur for those 200 ms (a blurred
 * element does not change size by animation). Under reduced motion there is no transition and so no attribute.
 */
export function usePanelMotion(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const start = (e: TransitionEvent): void => {
      if (e.target === el && e.propertyName === 'width') el.setAttribute('data-moving', '');
    };
    const end = (e: TransitionEvent): void => {
      if (e.target === el && e.propertyName === 'width') el.removeAttribute('data-moving');
    };
    el.addEventListener('transitionrun', start);
    el.addEventListener('transitionend', end);
    el.addEventListener('transitioncancel', end);
    return () => {
      el.removeEventListener('transitionrun', start);
      el.removeEventListener('transitionend', end);
      el.removeEventListener('transitioncancel', end);
    };
  }, [ref]);
}
