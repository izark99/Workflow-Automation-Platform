// The notices of linked reference tables change when a version is published, a table is linked or unlinked, or a draft is published.
// The sidebar shows a dot while a notice is open, so the screen that made the change tells it (SPEC 16.2 item 4). No data travels in the event.
const EVENT = 'dfw:ref-notices-changed';

export function announceRefNoticesChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

/** Calls `listener` on every change; returns the function that stops listening. */
export function onRefNoticesChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
