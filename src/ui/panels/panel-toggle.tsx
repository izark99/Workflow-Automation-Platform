import { Button } from '../components/button';
import { Icon } from '../components/icons';
import { useT } from '../i18n';
import { PANEL_NAME_KEYS, PANEL_SIDES, toggleIcon } from './panel-toggle-logic';
import type { PanelId } from './panel-state';

export interface PanelToggleProps {
  panel: PanelId;
  collapsed: boolean;
  onToggle: () => void;
  /** The id of the panel body this button controls. */
  controls: string;
}

/** The 36 px icon button that collapses or expands a panel (DESIGN, Collapsible panels). Its name says what it does. */
export function PanelToggle({ panel, collapsed, onToggle, controls }: PanelToggleProps) {
  const t = useT();
  const name = t(collapsed ? 'panels.expand' : 'panels.collapse', { panel: t(PANEL_NAME_KEYS[panel]) });
  return (
    <Button size="sm" icon aria-expanded={!collapsed} aria-controls={controls} aria-label={name} title={name} onClick={onToggle} data-panel-toggle={panel}>
      <Icon name={toggleIcon(PANEL_SIDES[panel], collapsed)} />
    </Button>
  );
}
