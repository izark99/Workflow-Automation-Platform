// Pure key handling for the Dropdown, so it can be unit tested without a browser.

export type ListKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

/** The index that a navigation key moves to. It stops at both ends. */
export function moveIndex(current: number, count: number, key: ListKey): number {
  if (count === 0) return -1;
  switch (key) {
    case 'ArrowDown':
      return Math.min(count - 1, current + 1);
    case 'ArrowUp':
      return Math.max(0, current - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
  }
}

/**
 * Type-ahead: the index of the next label that starts with the typed text, or -1.
 * One typed letter searches after the current option, so a repeated letter cycles; a longer text may match the current one.
 */
export function typeAhead(labels: string[], current: number, typed: string): number {
  const needle = typed.toLowerCase();
  if (!needle) return -1;
  const start = needle.length === 1 ? current + 1 : Math.max(current, 0);
  for (let i = 0; i < labels.length; i += 1) {
    const idx = (start + i) % labels.length;
    if ((labels[idx] ?? '').toLowerCase().startsWith(needle)) return idx;
  }
  return -1;
}

/** A printable single character (no modifier) is type-ahead input. */
export const isTypeAheadKey = (e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean =>
  e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;
