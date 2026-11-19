/** Collapsed or open state of the four collapsible panels (SPEC 12.4). Keep in step with the inline script of index.html. */
export const PANEL_IDS = ['sidebar', 'steps', 'settings', 'refList'] as const;
export type PanelId = (typeof PANEL_IDS)[number];
/** true means collapsed. */
export type PanelState = Record<PanelId, boolean>;

export const PANELS_STORAGE_KEY = 'dfw.panels';

export function defaultPanels(): PanelState {
  return { sidebar: false, steps: false, settings: false, refList: false };
}

/** Anything that is not a JSON object gives the defaults; a value that is not a boolean, or an unknown id, is ignored. */
export function parsePanels(raw: string | null | undefined): PanelState {
  const state = defaultPanels();
  if (!raw) return state;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return state;
    for (const id of PANEL_IDS) {
      const v = (value as Record<string, unknown>)[id];
      if (typeof v === 'boolean') state[id] = v;
    }
  } catch {
    // Broken JSON: every panel starts open.
  }
  return state;
}

/** Browser storage can be missing or throw (private window, blocked data): the defaults then apply. */
export function readPanels(storage: Pick<Storage, 'getItem'> | undefined): PanelState {
  try {
    return parsePanels(storage?.getItem(PANELS_STORAGE_KEY));
  } catch {
    return defaultPanels();
  }
}

export function savePanels(storage: Pick<Storage, 'setItem'> | undefined, state: PanelState): void {
  try {
    storage?.setItem(PANELS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The state still applies to this page; it is just not remembered.
  }
}

/** The part of an element that the panel state needs; a plain object stands in for it in unit tests. */
export type PanelRoot = Pick<Element, 'setAttribute' | 'removeAttribute'>;

export function applyPanels(root: PanelRoot, state: PanelState): void {
  for (const id of PANEL_IDS) {
    if (state[id]) root.setAttribute(`data-panel-${id}`, 'collapsed');
    else root.removeAttribute(`data-panel-${id}`);
  }
}

export interface PanelStore {
  get(id: PanelId): boolean;
  toggle(id: PanelId): void;
  subscribe(listener: () => void): () => void;
}

export function createPanelStore(
  storage: (Pick<Storage, 'getItem'> & Pick<Storage, 'setItem'>) | undefined,
  root: PanelRoot | undefined,
): PanelStore {
  let state = readPanels(storage);
  const listeners = new Set<() => void>();
  if (root) applyPanels(root, state);
  return {
    get: (id) => state[id],
    toggle(id) {
      state = { ...state, [id]: !state[id] };
      if (root) applyPanels(root, state);
      savePanels(storage, state);
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
