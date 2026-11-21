import { useEffect, useRef } from 'react';

/**
 * Escape closes the top layer and only that one (design/harold/README.md, "States and focus"): a list in a dialog closes before
 * the dialog does, an info popover before the page's own menu. Every layer that is open (a dialog, a dropdown list, a date
 * picker, an info popover, a menu) is on this stack in the order it opened; one listener on the document closes the last one.
 */
export interface Layer {
  close: () => void;
}

/** The layer that Escape closes: the last one that opened, or none. Pure, so it is tested without a browser. */
export function topLayer(stack: readonly Layer[]): Layer | undefined {
  return stack[stack.length - 1];
}

const stack: Layer[] = [];
let installed = false;

function onKey(e: KeyboardEvent): void {
  // A handler that already used the key (a tooltip that hides on Escape) has called preventDefault.
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const top = topLayer(stack);
  if (!top) return;
  e.preventDefault();
  top.close();
}

/** Puts a layer on the stack while `active` is true. `close` is called by Escape when the layer is the top one. */
export function useEscapeLayer(active: boolean, close: () => void): void {
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (!active) return undefined;
    const layer: Layer = { close: () => latest.current() };
    stack.push(layer);
    if (!installed) {
      document.addEventListener('keydown', onKey);
      installed = true;
    }
    return () => {
      const at = stack.indexOf(layer);
      if (at >= 0) stack.splice(at, 1);
    };
  }, [active]);
}
