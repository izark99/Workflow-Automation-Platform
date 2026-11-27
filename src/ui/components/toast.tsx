import { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import { useT } from '../i18n';
import { TOAST_EXIT_MS, toastReducer } from './toast-state';
import type { ToastActionSpec } from './toast-state';
import { Button } from './button';
import styles from './toast.module.css';

export interface ToastOptions {
  action?: ToastActionSpec;
  /** How long the toast stays. The default of the provider otherwise. */
  durationMs?: number;
}

type Show = (message: string, options?: ToastOptions) => number;
interface ToastApi {
  show: Show;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => 0, dismiss: () => undefined });

/** A toast confirms something that succeeded. An error never lives only in a toast; it is shown where it happened. */
export const useToast = (): Show => useContext(ToastContext).show;

/** Closes a toast by the id that `useToast` returned, for a toast that goes away with the next change. */
export const useDismissToast = (): ((id: number) => void) => useContext(ToastContext).dismiss;

export function ToastProvider({ children, durationMs = 5000 }: { children: ReactNode; durationMs?: number }) {
  const tr = useT();
  const [items, dispatch] = useReducer(toastReducer, []);
  const next = useRef(1);
  // A toast leaves in two steps: it is marked as closing (the exit animation), then removed.
  const leave = useCallback((id: number) => {
    dispatch({ type: 'closing', id });
    window.setTimeout(() => dispatch({ type: 'remove', id }), TOAST_EXIT_MS);
  }, []);
  const show = useCallback<Show>(
    (message, options) => {
      const id = next.current++;
      dispatch({ type: 'add', id, message, ...(options?.action ? { action: options.action } : {}) });
      window.setTimeout(() => leave(id), options?.durationMs ?? durationMs);
      return id;
    },
    [durationMs, leave],
  );
  const api = useMemo(() => ({ show, dismiss: leave }), [show, leave]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={styles.toast} data-closing={t.closing ? 'true' : undefined}>
            <span>{t.message}</span>
            {t.action ? (
              <Button
                size="sm"
                onClick={() => {
                  t.action?.onAct();
                  leave(t.id);
                }}
              >
                {t.action.label}
              </Button>
            ) : null}
            <button type="button" className={styles.dismiss} aria-label={tr('common.toast.dismiss')} onClick={() => leave(t.id)}>
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
