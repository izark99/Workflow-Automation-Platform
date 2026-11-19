import type { ReactNode } from 'react';
import { InfoTip } from './info-tip';
import styles from './page-header.module.css';

/**
 * The header every screen shares: breadcrumb line 24 px, title 36 px with an info button after it, one action on the right.
 * The subtitle text lives in the info button (SPEC 11.2), so no explanation is visible under the title.
 */
export function PageHeader({ breadcrumb, title, subtitle, action }: { breadcrumb: ReactNode; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <div className={styles.crumbs}>{breadcrumb}</div>
        <div className={styles.titleRow}>
          <h1>{title}</h1>
          <InfoTip label={title}>{subtitle}</InfoTip>
        </div>
      </div>
      {action}
    </header>
  );
}
