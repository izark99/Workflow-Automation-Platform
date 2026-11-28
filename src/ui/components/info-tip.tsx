import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { popoverLayer, useFloating } from './floating';
import { useT } from '../i18n';
import { Icon } from './icons';
import { INFO_TIP_CLOSED, INFO_TIP_HOVER_MS, INFO_TIP_LEAVE_MS, infoTipNext } from './info-tip-logic';
import type { InfoTipEvent, InfoTipState } from './info-tip-logic';
import { useEscapeLayer } from './layers';
import { useOutsideClose } from './popover';
import styles from './info-tip.module.css';

export interface InfoTipProps {
  /** What the button explains, for example "Effective date". The accessible name is "About {label}". */
  label: string;
  /** The explanation. Short text, a short list or links. Never an error or something needed to finish a task. */
  children: ReactNode;
  /** Starts open, for the components page. */
  defaultOpen?: boolean;
}

/** The info button: a 24 x 24 px toggletip placed after the title or label it explains. */
export function InfoTip({ label, children, defaultOpen = false }: InfoTipProps) {
  const t = useT();
  const [state, setState] = useState<InfoTipState>(defaultOpen ? { open: true, pinned: true } : INFO_TIP_CLOSED);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const floating = useFloating(buttonRef, popRef, state.open);
  const timer = useRef(0);
  const id = useId();

  const send = useCallback((event: InfoTipEvent) => {
    setState((s) => infoTipNext(s, event));
  }, []);

  useOutsideClose([rootRef, popRef], state.open, () => send('outside'));

  // Escape closes the popover; focus stays on the button, because it was never moved.
  useEscapeLayer(state.open, () => send('escape'));

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const hoverIn = (): void => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => send('hoverOpen'), INFO_TIP_HOVER_MS);
  };
  // The popover is outside the element of the button, so the pointer on the popover keeps it open by itself.
  const hoverKeep = (): void => {
    window.clearTimeout(timer.current);
    send('hoverOpen');
  };
  // Leaving closes after a short delay: the pointer crosses the gap between the button and its popover on the way to the popover,
  // and that must not close it. Entering either one again cancels the delay.
  const hoverOut = (): void => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => send('hoverLeave'), INFO_TIP_LEAVE_MS);
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
      {/* The popover is drawn in a layer on document.body (see floating.ts), so no container can cut it off. It is always in
          the page, hidden while closed, so that a screen reader that watches it announces the text when it appears. */}
      {popoverLayer() && createPortal(
        <span
          id={id}
          ref={popRef}
          role="status"
          aria-live="polite"
          className={state.open ? styles.popover : styles.hidden}
          style={state.open ? floating.style : undefined}
          onMouseEnter={hoverKeep}
          onMouseLeave={hoverOut}
        >
          {state.open ? children : null}
        </span>,
        popoverLayer()!,
      )}
    </span>
  );
}
