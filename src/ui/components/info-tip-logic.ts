/** Hover delay before an info button opens its popover (docs/DESIGN.md, "Info button"). */
export const INFO_TIP_HOVER_MS = 300;

/** How long the popover stays after the pointer left the button or the popover, so that the pointer can cross the gap between them. */
export const INFO_TIP_LEAVE_MS = 150;

export interface InfoTipState {
  open: boolean;
  /** Opened by a click, Enter or Space: it stays until a second click, Escape or a click outside. */
  pinned: boolean;
}

export type InfoTipEvent = 'click' | 'hoverOpen' | 'hoverLeave' | 'escape' | 'outside';

export const INFO_TIP_CLOSED: InfoTipState = { open: false, pinned: false };

/** The toggletip rules as a pure function, so they are unit tested without a browser. */
export function infoTipNext(state: InfoTipState, event: InfoTipEvent): InfoTipState {
  switch (event) {
    case 'click':
      return state.open && state.pinned ? INFO_TIP_CLOSED : { open: true, pinned: true };
    case 'hoverOpen':
      return state.open ? state : { open: true, pinned: false };
    case 'hoverLeave':
      return state.pinned ? state : INFO_TIP_CLOSED;
    case 'escape':
    case 'outside':
      return state.open ? INFO_TIP_CLOSED : state;
  }
}
