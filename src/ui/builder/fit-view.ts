/**
 * How "fit to screen" frames the steps. The bottom is larger than the other sides: the control bar (36 px buttons in a 56 px
 * bar, 16 px from the edge) sits at the bottom left, and no step may end up under it.
 */
export const FIT_VIEW_OPTIONS = {
  padding: { top: '24px', right: '24px', left: '24px', bottom: '96px' },
  maxZoom: 1,
} as const;
