import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, parseChoice, readChoice, resolveTheme, saveChoice, systemPrefersDark } from './theme';

describe('System with no browser preference', () => {
  const browser = (scheme: 'light' | 'dark' | 'none') => (query: string) =>
    (query === '(prefers-color-scheme: light)' && scheme === 'light') || (query === '(prefers-color-scheme: dark)' && scheme === 'dark');
  it('uses dark when the browser says neither light nor dark', () => {
    expect(resolveTheme('system', systemPrefersDark(browser('none')))).toBe('dark');
  });
  it('still follows a browser that prefers light or dark', () => {
    expect(resolveTheme('system', systemPrefersDark(browser('light')))).toBe('light');
    expect(resolveTheme('system', systemPrefersDark(browser('dark')))).toBe('dark');
  });
});

describe('theme choice', () => {
  it('accepts the three choices and falls back to system', () => {
    expect(parseChoice('light')).toBe('light');
    expect(parseChoice('dark')).toBe('dark');
    expect(parseChoice('system')).toBe('system');
    expect(parseChoice('purple')).toBe('system');
    expect(parseChoice(null)).toBe('system');
  });
  it('resolves system from the operating system and the others as they are', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('reads and saves through storage and survives a storage that throws', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    saveChoice(storage, 'dark');
    expect(data.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(readChoice(storage)).toBe('dark');
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readChoice(broken)).toBe('system');
    expect(() => saveChoice(broken, 'light')).not.toThrow();
    expect(readChoice(undefined)).toBe('system');
  });
});
