import type { ReactNode } from 'react';
import { Icon } from './icons';
import type { IconName } from './icons';
import styles from './badge.module.css';

export type BadgeTone = 'soft' | 'outline' | 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

/**
 * A word in a small box. The meaning is always in the text, never in the colour alone; a status tone (`success`, `warning`,
 * `danger`, `info`) also takes an icon.
 */
export function Badge({ tone = 'soft', icon, children }: { tone?: BadgeTone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </span>
  );
}
