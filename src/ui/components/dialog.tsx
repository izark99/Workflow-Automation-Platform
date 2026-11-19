import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { trapIndex } from './tab-keys';
import styles from './dialog.module.css';

export interface DialogProps {
  title: string;
  /** Called on Escape. The owner decides what closing means. */
  onClose: () => void;
  children: ReactNode;
  /** Width in px; 420 by default. */
  width?: number;
  /** The buttons, right-aligned. Put destructive buttons 8 px from the others (the gap does that). */
  actions: ReactNode;
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Modal dialog: focus moves in, Tab stays inside, Escape closes, focus returns to the element that opened it. */
export function Dialog({ title, onClose, children, actions, width }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = (): HTMLElement[] => Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    // Focus the first control, not a destructive one: the dialog asks, the user decides.
    (items()[0] ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === 'Tab') {
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
      opener?.focus();
    };
  }, []);

  return (
    <div className={styles.backdrop}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={styles.dialog} style={width ? { width } : undefined}>
        <span id={titleId} className={styles.title}>
          {title}
        </span>
        <div className={styles.body}>{children}</div>
        <div className={styles.actions}>{actions}</div>
      </div>
    </div>
  );
}
