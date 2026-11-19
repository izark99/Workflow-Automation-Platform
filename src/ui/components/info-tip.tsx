import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { Icon } from './icons';
import { INFO_TIP_CLOSED, INFO_TIP_HOVER_MS, infoTipNext } from './info-tip-logic';
import type { InfoTipEvent, InfoTipState } from './info-tip-logic';
import { opensUp, useOutsideClose } from './popover';
import styles from './info-tip.module.css';

export interface InfoTipProps {
  /** What the button explains, for example "Effective date". The accessible name is "About {label}". */
  label: string;
  /** The explanation. Short text, a short list or links. Never an error or something needed to finish a task. */
  children: ReactNode;
  /** Starts open, for the components page. */
  defaultOpen?: boolean;
}

const POPOVER_ROOM = 140;
const POPOVER_WIDTH = 320;

/** The info button: a 24 x 24 px toggletip placed after the title or label it explains. */
export function InfoTip({ label, children, defaultOpen = false }: InfoTipProps) {
  const t = useT();
  const [state, setState] = useState<InfoTipState>(defaultOpen ? { open: true, pinned: true } : INFO_TIP_CLOSED);
  const [up, setUp] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);
  const id = useId();

  const send = useCallback((event: InfoTipEvent) => {
    if (event === 'click' || event === 'hoverOpen') {
      // Measured before the popover renders, so it never opens on one side and then jumps to the other.
      const button = buttonRef.current;
      setUp(opensUp(button, POPOVER_ROOM));
      setAlignEnd(!!button && button.getBoundingClientRect().left + POPOVER_WIDTH > window.innerWidth - 8);
    }
    setState((s) => infoTipNext(s, event));
  }, []);

  useOutsideClose(rootRef, state.open, () => send('outside'));

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') send('escape'); // focus stays on the button: it was never moved
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.open, send]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const hoverIn = (): void => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => send('hoverOpen'), INFO_TIP_HOVER_MS);
  };
  const hoverOut = (): void => {
    window.clearTimeout(timer.current);
    send('hoverLeave');
  };

  return (
    <span ref={rootRef} className={styles.anchor} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        data-infotip=""
        aria-label={t('common.infoTip.about', { label })}
        aria-expanded={state.open}
        aria-controls={id}
        onClick={() => send('click')}
      >
        <Icon name="info" size={16} />
      </button>
      {/* The live region exists before the text does, so a screen reader announces the text when it appears. */}
      <span id={id} role="status" aria-live="polite" className={state.open ? `${styles.popover} ${up ? styles.up : ''} ${alignEnd ? styles.end : ''}` : styles.hidden}>
        {state.open ? children : null}
      </span>
    </span>
  );
}
