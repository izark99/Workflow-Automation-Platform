export interface ToastItem {
  id: number;
  message: string;
}

export type ToastAction = { type: 'add'; id: number; message: string } | { type: 'remove'; id: number };

/** At most 3 toasts are kept; the oldest goes first. */
export const MAX_TOASTS = 3;

export function toastReducer(items: ToastItem[], action: ToastAction): ToastItem[] {
  if (action.type === 'remove') return items.filter((t) => t.id !== action.id);
  return [...items, { id: action.id, message: action.message }].slice(-MAX_TOASTS);
}
