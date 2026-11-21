import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Icon } from './icons';
import styles from './button.module.css';

/** `cta` is the old name of the main action; it looks like `primary` and goes in T7.6b. */
export type ButtonVariant = 'cta' | 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

interface BaseProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  variant?: ButtonVariant;
  /** md is 40 px and sm is 32 px. No other height exists. */
  size?: ButtonSize;
  /** The old name of `size="sm"`; call sites move in T7.6b. */
  compact?: boolean;
  /** Shows a spinner over the label and sets aria-busy. The width does not change, and the button does not react to clicks while busy. */
  busy?: boolean;
  /** Full width of its container, label at the start (the step list). */
  block?: boolean;
  /** React 19 passes `ref` as a prop. */
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

/** A button that holds only an icon is as wide as it is high and always has a label, which is also its tooltip. */
export type ButtonProps = BaseProps & ({ icon: true; 'aria-label': string } | { icon?: false });

export function Button({ variant = 'secondary', size = 'md', compact = false, busy = false, block = false, icon = false, children, onClick, type = 'button', ...props }: ButtonProps) {
  // The tooltip of an icon button is drawn by the button itself (after 400 ms), so a native title would show a second one.
  const { title: _title, ...rest } = props;
  void _title;
  const small = compact || size === 'sm';
  const classes = [styles.button, styles[variant], small ? styles.sm : '', block ? styles.block : '', icon ? styles.icon : ''].filter(Boolean).join(' ');
  const label = props['aria-label'];
  return (
    <button
      {...(icon ? rest : props)}
      type={type}
      className={classes}
      data-variant={variant}
      data-tooltip={icon ? label : undefined}
      aria-busy={busy ? 'true' : undefined}
      onClick={busy ? undefined : onClick}
    >
      {busy ? (
        <span className={styles.spinner}>
          <span className={styles.spin}>
            <Icon name="loader-circle" />
          </span>
        </span>
      ) : null}
      <span className={styles.label}>{children}</span>
    </button>
  );
}
