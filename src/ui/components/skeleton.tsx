import { useEffect, useState } from 'react';
import styles from './skeleton.module.css';

/** The skeleton waits this long, so fast screens do not flash (docs/DESIGN.md). */
export const SKELETON_DELAY_MS = 300;

/** True once `loading` has lasted longer than `delayMs`. */
export function useDelayedLoading(loading: boolean, delayMs = SKELETON_DELAY_MS): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when loading ends
      setLate(false);
      return;
    }
    const timer = window.setTimeout(() => setLate(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [loading, delayMs]);
  return loading && late;
}

const WIDTHS = [70, 59, 48, 67, 54, 63, 45, 56];

/**
 * A placeholder with the header and row heights of the real table (41 px and 45 px, 37 px when `dense`), so nothing moves when the data arrives.
 * `weights` are the relative column widths. The region is `aria-busy` while it is shown.
 */
export function SkeletonTable({ weights, rows = 3, label, dense = false }: { weights: number[]; rows?: number; label: string; dense?: boolean }) {
  return (
    <div className={styles.box} aria-busy="true" role="status" aria-label={label}>
      <div className={styles.head} aria-hidden="true">
        {weights.map((w, c) => (
          <span key={c} className={styles.cell} style={{ flex: `${w} 1 0` }}>
            <span className={`${styles.bar} ${styles.headBar}`} style={{ width: '45%' }} />
          </span>
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={`${styles.row} ${dense ? styles.dense : ''}`} aria-hidden="true">
          {weights.map((w, c) => (
            <span key={c} className={styles.cell} style={{ flex: `${w} 1 0` }}>
              <span className={styles.bar} style={{ width: `${WIDTHS[(r * 3 + c) % WIDTHS.length]}%` }} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
