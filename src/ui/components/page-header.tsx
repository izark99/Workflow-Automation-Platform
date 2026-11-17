import type { ReactNode } from 'react';
import styles from './page-header.module.css';

/**
 * The header every screen shares: breadcrumb line 24 px, title 36 px, subtitle 21 px, one action on the right.
 * With the main column's 32 px top padding the title sits at y 63 and the next block at y 148.
 */
export function PageHeader({ breadcrumb, title, subtitle, action }: { breadcrumb: ReactNode; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <div className={styles.crumbs}>{breadcrumb}</div>
        <h1>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}
