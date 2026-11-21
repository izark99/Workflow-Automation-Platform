import { useState } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode, Ref } from 'react';
import { Icon } from './icons';
import styles from './button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

interface BaseProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  variant?: ButtonVariant;
  /** md is 40 px and sm is 32 px. No other height exists. */
  size?: ButtonSize;
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

export function Button({ variant = 'secondary', size = 'md', busy = false, block = false, icon = false, children, onClick, type = 'button', ...props }: ButtonProps) {
  // The tooltip of an icon button is drawn by the button itself (after 400 ms), so a native title would show a second one.
  const { title: _title, ...rest } = props;
  void _title;
  const small = size === 'sm';
  const classes = [styles.button, styles[variant], small ? styles.sm : '', block ? styles.block : '', icon ? styles.icon : ''].filter(Boolean).join(' ');
  const label = props['aria-label'];
  // Escape hides the tooltip of an icon button while it shows (Harold: "Escape hides it"); the key is then used up.
  const [tipOff, setTipOff] = useState(false);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    props.onKeyDown?.(e);
    if (!icon || e.key !== 'Escape' || e.defaultPrevented) return;
    if (Number(getComputedStyle(e.currentTarget, '::after').opacity) > 0) {
      e.preventDefault();
      setTipOff(true);
    }
  };
  return (
    <button
      {...(icon ? rest : props)}
      type={type}
      className={classes}
      data-variant={variant}
      data-tooltip={icon ? label : undefined}
      data-tooltip-off={icon && tipOff ? '' : undefined}
      onKeyDown={onKeyDown}
      onMouseLeave={(e) => {
        props.onMouseLeave?.(e);
        setTipOff(false);
      }}
      onBlur={(e) => {
        props.onBlur?.(e);
        setTipOff(false);
      }}
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
