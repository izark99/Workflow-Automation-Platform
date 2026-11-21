import type { ReactNode } from 'react';
import { Icon } from './icons';
import styles from './states.module.css';

/** Icon, one line of text, one action. */
export function EmptyState({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name="inbox" size={24} />
      </span>
      <span className={styles.emptyTitle}>{title}</span>
      <span className={styles.muted}>{text}</span>
      {action}
    </div>
  );
}

/** Says what failed and what to do next, next to the place where it failed. Never only a toast. */
export function ErrorState({ what, next, actions }: { what: string; next: string; actions?: ReactNode }) {
  return (
    <div role="alert" className={styles.error}>
      <Icon name="circle-alert" size={20} />
      <div className={styles.errorBody}>
        <span>
          <b>{what}</b> {next}
        </span>
        {actions ? <div className={styles.errorActions}>{actions}</div> : null}
      </div>
    </div>
  );
}
