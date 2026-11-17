/** The tab that a key moves to (wrapping), or null when the key is not a tab navigation key. */
export function nextTab(index: number, count: number, key: string): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count;
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** Where focus goes when Tab is pressed inside a dialog: wraps at both ends so focus never leaves. */
export function trapIndex(index: number, count: number, shift: boolean): number {
  if (count === 0) return -1;
  if (index < 0) return shift ? count - 1 : 0;
  return shift ? (index - 1 + count) % count : (index + 1) % count;
}
