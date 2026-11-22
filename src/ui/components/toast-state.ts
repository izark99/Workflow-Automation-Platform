export interface ToastItem {
  id: number;
  message: string;
  /** True while the toast plays its 170 ms exit; it is removed after that. */
  closing?: boolean;
}

export type ToastAction = { type: 'add'; id: number; message: string } | { type: 'closing'; id: number } | { type: 'remove'; id: number };

/** At most 3 toasts are kept; the oldest goes first. */
export const MAX_TOASTS = 3;

/** How long a toast takes to leave. */
export const TOAST_EXIT_MS = 170;

export function toastReducer(items: ToastItem[], action: ToastAction): ToastItem[] {
  if (action.type === 'remove') return items.filter((t) => t.id !== action.id);
  if (action.type === 'closing') return items.map((t) => (t.id === action.id ? { ...t, closing: true } : t));
  return [...items, { id: action.id, message: action.message }].slice(-MAX_TOASTS);
}
