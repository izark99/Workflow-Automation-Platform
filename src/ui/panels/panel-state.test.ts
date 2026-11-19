import { describe, expect, it } from 'vitest';
import {
  PANELS_STORAGE_KEY,
  PANEL_IDS,
  createPanelStore,
  defaultPanels,
  parsePanels,
  readPanels,
  savePanels,
} from './panel-state';

function memory(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(PANELS_STORAGE_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  };
}

describe('panel state', () => {
  it('starts every panel open', () => {
    expect(PANEL_IDS).toEqual(['sidebar', 'steps', 'settings', 'refList']);
    expect(defaultPanels()).toEqual({ sidebar: false, steps: false, settings: false, refList: false });
    expect(readPanels(memory())).toEqual(defaultPanels());
  });
  it('gives the defaults for broken JSON, a wrong type or an unknown id', () => {
    expect(parsePanels('{not json')).toEqual(defaultPanels());
    expect(parsePanels('[1,2]')).toEqual(defaultPanels());
    expect(parsePanels('"x"')).toEqual(defaultPanels());
    expect(parsePanels(null)).toEqual(defaultPanels());
    expect(parsePanels('{"sidebar":"yes"}')).toEqual(defaultPanels());
    expect(parsePanels('{"nope":true}')).toEqual(defaultPanels());
    expect(parsePanels('{"sidebar":true,"nope":true}')).toEqual({ ...defaultPanels(), sidebar: true });
  });
  it('survives a storage that throws or is missing', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readPanels(broken)).toEqual(defaultPanels());
    expect(() => savePanels(broken, defaultPanels())).not.toThrow();
    expect(readPanels(undefined)).toEqual(defaultPanels());
  });
  it('persists through storage', () => {
    const s = memory();
    savePanels(s, { ...defaultPanels(), steps: true });
    expect(JSON.parse(s.data.get(PANELS_STORAGE_KEY) ?? '{}')).toMatchObject({ steps: true });
    expect(readPanels(s).steps).toBe(true);
  });
  it('keeps two panels independent and tells subscribers', () => {
    const s = memory();
    const root = fakeRoot();
    const store = createPanelStore(s, root);
    let calls = 0;
    store.subscribe(() => calls++);
    store.toggle('sidebar');
    expect(store.get('sidebar')).toBe(true);
    expect(store.get('steps')).toBe(false);
    expect(root.attrs.get('data-panel-sidebar')).toBe('collapsed');
    expect(root.attrs.has('data-panel-steps')).toBe(false);
    store.toggle('steps');
    store.toggle('sidebar');
    expect(store.get('sidebar')).toBe(false);
    expect(root.attrs.has('data-panel-sidebar')).toBe(false);
    expect(root.attrs.get('data-panel-steps')).toBe('collapsed');
    expect(calls).toBe(3);
    expect(readPanels(s)).toEqual({ ...defaultPanels(), steps: true });
  });
  it('applies a stored state to the root when created', () => {
    const root = fakeRoot();
    createPanelStore(memory('{"settings":true}'), root);
    expect(root.attrs.get('data-panel-settings')).toBe('collapsed');
  });
});
