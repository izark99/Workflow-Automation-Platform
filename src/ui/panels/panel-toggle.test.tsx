import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelToggle } from './panel-toggle';
import { PANEL_NAME_KEYS, toggleIcon } from './panel-toggle-logic';
import { PANEL_IDS } from './panel-state';
import { en } from '../i18n/messages/en';
import { vi } from '../i18n/messages/vi';

const noop = (): void => undefined;

describe('PanelToggle', () => {
  it('is a 36 px icon button with aria-expanded, aria-controls and a name that says what it does', () => {
    const open = renderToStaticMarkup(<PanelToggle panel="sidebar" collapsed={false} onToggle={noop} controls="sidebar-body" />);
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('aria-controls="sidebar-body"');
    expect(open).toContain('aria-label="Collapse sidebar"');
    const shut = renderToStaticMarkup(<PanelToggle panel="settings" collapsed onToggle={noop} controls="settings-body" />);
    expect(shut).toContain('aria-expanded="false"');
    expect(shut).toContain('aria-label="Expand settings panel"');
  });
  it('points the chevron to the edge when open and away from it when collapsed', () => {
    expect(toggleIcon('left', false)).toBe('chevronLeft');
    expect(toggleIcon('left', true)).toBe('chevronRight');
    expect(toggleIcon('right', false)).toBe('chevronRight');
    expect(toggleIcon('right', true)).toBe('chevronLeft');
  });
  it('has a catalog name for every panel in both languages', () => {
    for (const id of PANEL_IDS) {
      const key = PANEL_NAME_KEYS[id];
      expect(en[key]).toBeTruthy();
      expect(vi[key]).toBeTruthy();
    }
    expect(vi['panels.collapse']).toContain('{panel}');
    expect(vi['panels.expand']).toContain('{panel}');
  });
});
