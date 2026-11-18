import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './icons';
import styles from './button.module.css';

export type ButtonVariant = 'cta' | 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  variant?: ButtonVariant;
  /** 40 px by default, 36 px when compact. No other height exists. */
  compact?: boolean;
  /** Shows a spinner and sets aria-busy. The button does not react to clicks while busy. */
  busy?: boolean;
  /** Full width of its container, label at the start (the step list). */
  block?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'secondary', compact = false, busy = false, block = false, children, onClick, type = 'button', ...rest }: ButtonProps) {
  const classes = [styles.button, styles[variant], compact ? styles.compact : '', block ? styles.block : ''].filter(Boolean).join(' ');
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      data-variant={variant}
      aria-busy={busy ? 'true' : undefined}
      onClick={busy ? undefined : onClick}
    >
      {busy ? (
        <span className={styles.spin} style={{ display: 'inline-flex' }}>
          <Icon name="spinner" />
        </span>
      ) : null}
      {children}
    </button>
  );
}
