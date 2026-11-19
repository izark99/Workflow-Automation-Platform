import { describe, expect, it } from 'vitest';
import { INFO_TIP_CLOSED, infoTipNext } from './info-tip-logic';

describe('info button state', () => {
  it('a click opens and pins, a second click closes', () => {
    const open = infoTipNext(INFO_TIP_CLOSED, 'click');
    expect(open).toEqual({ open: true, pinned: true });
    expect(infoTipNext(open, 'click')).toEqual(INFO_TIP_CLOSED);
  });
  it('hover opens without pinning, and leaving closes it', () => {
    const hovered = infoTipNext(INFO_TIP_CLOSED, 'hoverOpen');
    expect(hovered).toEqual({ open: true, pinned: false });
    expect(infoTipNext(hovered, 'hoverLeave')).toEqual(INFO_TIP_CLOSED);
  });
  it('a click while it is open from hover pins it instead of closing it', () => {
    const pinned = infoTipNext({ open: true, pinned: false }, 'click');
    expect(pinned).toEqual({ open: true, pinned: true });
    expect(infoTipNext(pinned, 'hoverLeave')).toEqual(pinned);
  });
  it('hover does not unpin an open popover', () => {
    const pinned = { open: true, pinned: true };
    expect(infoTipNext(pinned, 'hoverOpen')).toEqual(pinned);
  });
  it('Escape and a click outside close it, pinned or not', () => {
    expect(infoTipNext({ open: true, pinned: true }, 'escape')).toEqual(INFO_TIP_CLOSED);
    expect(infoTipNext({ open: true, pinned: false }, 'outside')).toEqual(INFO_TIP_CLOSED);
    expect(infoTipNext(INFO_TIP_CLOSED, 'escape')).toEqual(INFO_TIP_CLOSED);
  });
});
