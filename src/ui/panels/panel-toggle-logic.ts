import type { IconName } from '../components/icons';
import type { MessageKey } from '../i18n/messages/en';
import type { PanelId } from './panel-state';

/** The edge a panel sits on. */
export type PanelSide = 'left' | 'right';

/** A chevron that points to the edge when the panel is open (it will move there) and away from it when collapsed. */
export function toggleIcon(side: PanelSide, collapsed: boolean): IconName {
  const towardEdge = !collapsed;
  if (side === 'left') return towardEdge ? 'chevronLeft' : 'chevronRight';
  return towardEdge ? 'chevronRight' : 'chevronLeft';
}

export const PANEL_NAME_KEYS: Record<PanelId, MessageKey> = {
  sidebar: 'panels.name.sidebar',
  steps: 'panels.name.steps',
  settings: 'panels.name.settings',
  refList: 'panels.name.refList',
};

export const PANEL_SIDES: Record<PanelId, PanelSide> = { sidebar: 'left', steps: 'left', settings: 'right', refList: 'left' };
