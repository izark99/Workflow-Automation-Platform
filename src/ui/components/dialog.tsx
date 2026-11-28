import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { useEscapeLayer } from './layers';
import { trapIndex } from './tab-keys';

/** How long a dialog takes to leave (Harold: 170 ms). */
const EXIT_MS = 170;
import styles from './dialog.module.css';

export interface DialogProps {
  title: string;
  /** Called on Escape. The owner decides what closing means. */
  onClose: () => void;
  children: ReactNode;
  /** Width in px; 420 by default. */
  width?: number;
  /** The wide variant (the preview popup): up to the window minus 96 px each way, at least 960 x 560 px. The body does not scroll; its content does. */
  wide?: boolean;
  /** The buttons, right-aligned. Put destructive buttons 8 px from the others (the gap does that). */
  actions: ReactNode;
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Modal dialog: focus moves in, Tab stays inside, Escape closes, focus returns to the element that opened it. */
export function Dialog({ title, onClose, children, actions, width, wide = false }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  // Escape closes the top layer: a list or an info popover open in the dialog closes first.
  useEscapeLayer(true, onClose);

  useEffect(() => {
    // React clears the ref before this effect's cleanup runs on an unmount, so the layer is kept here.
    const layer = layerRef.current;
    const panel = ref.current;
    let size: { width: number; height: number } | null = null;
    const watcher = typeof ResizeObserver === 'undefined' || !panel ? null : new ResizeObserver(() => {
      size = { width: panel.offsetWidth, height: panel.offsetHeight };
    });
    if (panel) size = { width: panel.offsetWidth, height: panel.offsetHeight };
    watcher?.observe(panel!);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // A hidden element (the file input behind a button) cannot take focus, so it is not a stop of the dialog.
    const items = (): HTMLElement[] => Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.getClientRects().length > 0);
    // Focus the first control, not a destructive one: the dialog asks, the user decides.
    // A scroll region made focusable for the keyboard (data-dialog-scroll) is a stop of the dialog, but not the first one.
    (items().find((el) => el.hasAttribute('data-autofocus')) ?? items().find((el) => !el.hasAttribute('data-dialog-scroll')) ?? items()[0] ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') {
        const list = items();
        if (list.length === 0) return;
        e.preventDefault();
        const at = list.indexOf(document.activeElement as HTMLElement);
        list[trapIndex(at, list.length, e.shiftKey)]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      watcher?.disconnect();
      leaveAsGhost(layer, panel, size);
      opener?.focus();
    };
  }, []);

  return (
    <div ref={layerRef} className={styles.backdrop} data-dialog-layer>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={wide ? `${styles.dialog} ${styles.wide}` : styles.dialog} style={width && !wide ? { width } : undefined}>
        <span id={titleId} className={styles.title}>
          {title}
        </span>
        <div className={wide ? `${styles.body} ${styles.wideBody}` : styles.body}>{children}</div>
        <div className={styles.actions}>{actions}</div>
      </div>
    </div>
  );
}

/**
 * The dialog is gone from the React tree the moment its owner stops rendering it, so it cannot play an exit animation itself.
 * An empty copy of its layer and its panel, at the size the panel had, stays for 170 ms and fades out. The copy has no text, no
 * role, no id and no control, and it is inert and hidden from assistive technology, so focus, tests and screen readers only ever
 * see the real dialog and never find its content twice.
 */
function leaveAsGhost(layer: HTMLElement | null, panel: HTMLElement | null, size: { width: number; height: number } | null): void {
  // On a real unmount React has already removed the layer from the page when this cleanup runs; in development, Strict Mode
  // runs the cleanup of an effect that is still mounted, and then the layer is still in the page: no copy for that one.
  if (!layer || !panel || !size || layer.isConnected) return;
  const ghostLayer = document.createElement('div');
  ghostLayer.className = layer.className;
  ghostLayer.setAttribute('data-closing', 'true');
  ghostLayer.setAttribute('aria-hidden', 'true');
  ghostLayer.setAttribute('inert', '');
  const ghost = document.createElement('div');
  ghost.className = panel.className;
  ghost.style.width = `${size.width}px`;
  ghost.style.height = `${size.height}px`;
  ghostLayer.append(ghost);
  document.body.append(ghostLayer);
  window.setTimeout(() => ghostLayer.remove(), EXIT_MS);
}
