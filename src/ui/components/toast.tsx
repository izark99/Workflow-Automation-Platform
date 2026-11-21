import { createContext, useCallback, useContext, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import { useT } from '../i18n';
import { toastReducer } from './toast-state';
import styles from './toast.module.css';

const ToastContext = createContext<(message: string) => void>(() => undefined);

/** A toast confirms something that succeeded. An error never lives only in a toast; it is shown where it happened. */
export const useToast = (): ((message: string) => void) => useContext(ToastContext);

export function ToastProvider({ children, durationMs = 5000 }: { children: ReactNode; durationMs?: number }) {
  const tr = useT();
  const [items, dispatch] = useReducer(toastReducer, []);
  const next = useRef(1);
  const show = useCallback(
    (message: string) => {
      const id = next.current++;
      dispatch({ type: 'add', id, message });
      window.setTimeout(() => dispatch({ type: 'remove', id }), durationMs);
    },
    [durationMs],
  );
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={styles.toast}>
            {t.message}
            <button type="button" className={styles.dismiss} aria-label={tr('common.toast.dismiss')} onClick={() => dispatch({ type: 'remove', id: t.id })}>
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
