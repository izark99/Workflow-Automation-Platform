import { createContext, useContext, type ReactNode } from 'react';
import { useTheme, type Theme, type ThemeChoice } from './theme';

interface ThemeValue {
  choice: ThemeChoice;
  theme: Theme;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/** One theme state for the whole app, so the sidebar, the sign-in screen and the canvas agree. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useTheme();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme needs a ThemeProvider. Wrap the app in <ThemeProvider>.');
  return value;
}
