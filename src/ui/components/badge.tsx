import type { ReactNode } from 'react';
import styles from './badge.module.css';

/** A word in a pill. The meaning is always in the text, never in the color alone. */
export function Badge({ tone = 'soft', children }: { tone?: 'soft' | 'outline'; children: ReactNode }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
