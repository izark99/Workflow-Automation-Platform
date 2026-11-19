import { useCallback, useSyncExternalStore } from 'react';
import { createPanelStore, type PanelId, type PanelStore } from './panel-state';

let shared: PanelStore | undefined;

function store(): PanelStore {
  shared ??= createPanelStore(
    typeof localStorage === 'undefined' ? undefined : localStorage,
    typeof document === 'undefined' ? undefined : document.documentElement,
  );
  return shared;
}

/** The collapsed state of one panel, shared by every component and remembered in this browser. */
export function usePanel(id: PanelId): { collapsed: boolean; toggle: () => void } {
  const s = store();
  const collapsed = useSyncExternalStore(s.subscribe, () => s.get(id), () => false);
  const toggle = useCallback(() => store().toggle(id), [id]);
  return { collapsed, toggle };
}
