import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { nextTab, trapIndex } from './tab-keys';
import { MAX_TOASTS, toastReducer } from './toast-state';
import { Checkbox, Chip, Dialog, EmptyState, ErrorState, SkeletonTable, Tabs, ToastProvider } from './index';

const html = (el: React.ReactElement): string => renderToStaticMarkup(el);
const noop = (): void => undefined;

describe('Checkbox', () => {
  it('is a role=checkbox button with aria-checked, never an input', () => {
    const on = html(<Checkbox checked onChange={noop}>View and run</Checkbox>);
    expect(on).toContain('role="checkbox"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('<path');
    expect(on).not.toContain('<input');
    const off = html(<Checkbox checked={false} onChange={noop}>View and run</Checkbox>);
    expect(off).toContain('aria-checked="false"');
    expect(off).not.toContain('<path');
  });
  it('can be disabled', () => {
    expect(html(<Checkbox checked={false} disabled onChange={noop}>x</Checkbox>)).toContain('disabled');
  });
});

describe('Tabs and chips', () => {
  const tabs = [{ id: 'setup', label: 'Setup' }, { id: 'configure', label: 'Configure' }];
  it('renders a tablist with one selected tab, roving tabindex and a labelled panel', () => {
    const out = html(<Tabs label="Step settings" tabs={tabs} selected="configure" onSelect={noop}>content</Tabs>);
    expect(out).toContain('role="tablist"');
    expect(out.match(/role="tab"/g)?.length).toBe(2);
    expect(out).toMatch(/aria-selected="true"[^>]*tabindex="0"[^>]*>Configure|aria-selected="true"/);
    expect(out).toContain('tabindex="-1"');
    expect(out).toContain('role="tabpanel"');
    expect(out).toContain('content');
  });
  it('arrow keys wrap, Home and End jump, other keys are ignored', () => {
    expect(nextTab(0, 3, 'ArrowRight')).toBe(1);
    expect(nextTab(2, 3, 'ArrowRight')).toBe(0);
    expect(nextTab(0, 3, 'ArrowLeft')).toBe(2);
    expect(nextTab(1, 3, 'Home')).toBe(0);
    expect(nextTab(1, 3, 'End')).toBe(2);
    expect(nextTab(1, 3, 'a')).toBeNull();
    expect(nextTab(0, 0, 'ArrowRight')).toBeNull();
  });
  it('a chip shows its pressed state', () => {
    expect(html(<Chip pressed onClick={noop}>Shared</Chip>)).toContain('aria-pressed="true"');
  });
});

describe('Dialog', () => {
  it('is a modal dialog named by its title', () => {
    const out = html(<Dialog title="Delete flow" onClose={noop} actions={<button>Cancel</button>}>Body text</Dialog>);
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
    const id = /aria-labelledby="([^"]+)"/.exec(out)?.[1];
    expect(out).toContain(`id="${id}"`);
    expect(out).toContain('Body text');
  });
  it('the focus trap wraps in both directions', () => {
    expect(trapIndex(2, 3, false)).toBe(0);
    expect(trapIndex(0, 3, true)).toBe(2);
    expect(trapIndex(0, 3, false)).toBe(1);
    expect(trapIndex(-1, 3, false)).toBe(0);
    expect(trapIndex(-1, 3, true)).toBe(2);
    expect(trapIndex(0, 0, false)).toBe(-1);
  });
});

describe('Toast', () => {
  it('keeps the newest toasts and removes by id', () => {
    let items = toastReducer([], { type: 'add', id: 1, message: 'a' });
    for (let i = 2; i <= MAX_TOASTS + 2; i += 1) items = toastReducer(items, { type: 'add', id: i, message: String(i) });
    expect(items).toHaveLength(MAX_TOASTS);
    expect(items[0]?.id).toBe(MAX_TOASTS + 2 - (MAX_TOASTS - 1));
    expect(toastReducer(items, { type: 'remove', id: items[0]!.id })).toHaveLength(MAX_TOASTS - 1);
  });
  it('a toast is marked as closing before it is removed', () => {
    const items = toastReducer([], { type: 'add', id: 1, message: 'a' });
    expect(items[0]?.closing).toBeUndefined();
    const closing = toastReducer(items, { type: 'closing', id: 1 });
    expect(closing[0]?.closing).toBe(true);
    expect(toastReducer(closing, { type: 'remove', id: 1 })).toEqual([]);
  });
  it('the region is a polite live region', () => {
    const out = html(<ToastProvider>x</ToastProvider>);
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
  });
});

describe('Skeleton, empty and error states', () => {
  it('the skeleton region is aria-busy and hides its bars from assistive technology', () => {
    const out = html(<SkeletonTable weights={[30, 16, 8]} rows={3} label="Loading flows" />);
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('aria-label="Loading flows"');
    expect(out.match(/aria-hidden="true"/g)?.length).toBe(4);
  });
  it('the empty state has an icon, one line and the action', () => {
    const out = html(<EmptyState title="No flows yet" text="Create your first flow." action={<button>Create flow</button>} />);
    expect(out).toContain('<svg');
    expect(out).toContain('No flows yet');
    expect(out).toContain('Create flow');
  });
  it('the error state is an alert that says what failed and what to do next', () => {
    const out = html(<ErrorState what="The file could not be read." next="Choose another file." actions={<button>Retry</button>} />);
    expect(out).toContain('role="alert"');
    expect(out).toContain('<b>The file could not be read.</b> Choose another file.');
    expect(out).toContain('Retry');
  });
});
