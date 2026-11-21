import { Link } from 'react-router-dom';
import type { MouseEvent, ReactNode } from 'react';
import type { ButtonSize, ButtonVariant } from './button';
import styles from './button.module.css';

/** A link that looks and measures like a button (same 40 or 32 px heights). It navigates; it does not act. */
export function ButtonLink({ to, variant = 'secondary', size = 'md', children, ...rest }: { to: string; variant?: ButtonVariant; size?: ButtonSize; children: ReactNode; 'aria-label'?: string; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const classes = [styles.button, styles[variant], size === 'sm' ? styles.sm : ''].filter(Boolean).join(' ');
  return (
    <Link to={to} className={classes} style={{ textDecoration: 'none' }} {...rest}>
      {children}
    </Link>
  );
}
