import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import styles from './crumb-link.module.css';

/** A breadcrumb link: a text link, 24 px high (DESIGN). It is not a button. */
export function CrumbLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={styles.crumb}>
      {children}
    </Link>
  );
}
