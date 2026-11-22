import { createContext, useCallback, useContext, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import { useT } from '../i18n';
import { TOAST_EXIT_MS, toastReducer } from './toast-state';
import styles from './toast.module.css';

const ToastContext = createContext<(message: string) => void>(() => undefined);

/** A toast confirms something that succeeded. An error never lives only in a toast; it is shown where it happened. */
export const useToast = (): ((message: string) => void) => useContext(ToastContext);

export function ToastProvider({ children, durationMs = 5000 }: { children: ReactNode; durationMs?: number }) {
  const tr = useT();
  const [items, dispatch] = useReducer(toastReducer, []);
  const next = useRef(1);
  // A toast leaves in two steps: it is marked as closing (the exit animation), then removed.
  const leave = useCallback((id: number) => {
    dispatch({ type: 'closing', id });
    window.setTimeout(() => dispatch({ type: 'remove', id }), TOAST_EXIT_MS);
  }, []);
  const show = useCallback(
    (message: string) => {
      const id = next.current++;
      dispatch({ type: 'add', id, message });
      window.setTimeout(() => leave(id), durationMs);
    },
    [durationMs, leave],
  );
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={styles.toast} data-closing={t.closing ? 'true' : undefined}>
            {t.message}
            <button type="button" className={styles.dismiss} aria-label={tr('common.toast.dismiss')} onClick={() => leave(t.id)}>
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
