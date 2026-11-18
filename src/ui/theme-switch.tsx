import { Dropdown } from './components';
import { strings } from './strings';
import { THEME_CHOICES, type ThemeChoice } from './theme';
import { useAppTheme } from './theme-context';

/** Compact Light / Dark / System control for the sidebar footer and the sign-in screen. */
export function ThemeSwitch({ width = 184 }: { width?: number }) {
  const t = strings.theme;
  const { choice, setChoice } = useAppTheme();
  return (
    <Dropdown
      label={t.label}
      options={THEME_CHOICES.map((c) => ({ value: c, label: t[c] }))}
      value={choice}
      onChange={(v) => setChoice(v as ThemeChoice)}
      width={width}
    />
  );
}
