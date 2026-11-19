import { useEffect, useId, useSyncExternalStore } from 'react';

// Screens with unsaved changes report here, so the inactivity dialog can say that they will be lost (SPEC 12.2 item 3).
const reporters = new Set<string>();
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());

export function setUnsaved(id: string, dirty: boolean): void {
  const had = reporters.has(id);
  if (dirty === had) return;
  if (dirty) reporters.add(id);
  else reporters.delete(id);
  emit();
}

export const hasUnsaved = (): boolean => reporters.size > 0;

/** A screen calls this with whether it has unsaved changes. It reports "no" again when the screen goes away. */
export function useReportUnsaved(dirty: boolean): void {
  const id = useId();
  useEffect(() => {
    setUnsaved(id, dirty);
    return () => setUnsaved(id, false);
  }, [id, dirty]);
}

export function useHasUnsaved(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    hasUnsaved,
    () => false,
  );
}
