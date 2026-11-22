import { useCallback, useEffect, useState } from 'react';

/** The user's choice. `system` follows the operating system and changes live (SPEC 11.4). */
export type ThemeChoice = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'dfw.theme';
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];

export function parseChoice(raw: string | null | undefined): ThemeChoice {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): Theme {
  if (choice === 'system') return systemPrefersDark ? 'dark' : 'light';
  return choice;
}

/** Browser storage can be missing or throw (private window, blocked data): the default then applies. */
export function readChoice(storage: Pick<Storage, 'getItem'> | undefined): ThemeChoice {
  try {
    return parseChoice(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function saveChoice(storage: Pick<Storage, 'setItem'> | undefined, choice: ThemeChoice): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // The choice still applies to this page; it is just not remembered.
  }
}

export function applyTheme(root: HTMLElement, theme: Theme): void {
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** System uses dark unless the browser says it prefers light, so a browser with no preference gets dark (SPEC 14). */
export function systemPrefersDark(matches: (query: string) => boolean): boolean {
  return !matches(LIGHT_QUERY);
}

function browserPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return systemPrefersDark((q) => window.matchMedia(q).matches);
}

/** The current choice and the resolved theme. Applies the theme to <html> and follows the operating system for `system`. */
export function useTheme(): { choice: ThemeChoice; theme: Theme; setChoice: (choice: ThemeChoice) => void } {
  const [choice, setChoiceState] = useState<ThemeChoice>(() =>
    typeof localStorage === 'undefined' ? 'system' : readChoice(localStorage),
  );
  const [dark, setDark] = useState(browserPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(LIGHT_QUERY);
    const onChange = (): void => setDark(!query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const theme = resolveTheme(choice, dark);
  useEffect(() => applyTheme(document.documentElement, theme), [theme]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    saveChoice(localStorage, next);
  }, []);
  return { choice, theme, setChoice };
}
