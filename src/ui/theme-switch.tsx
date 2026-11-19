import { Dropdown } from './components';
import { useT } from './i18n';
import { THEME_CHOICES, type ThemeChoice } from './theme';
import { useAppTheme } from './theme-context';

/** Compact Light / Dark / System control for the sidebar footer and the sign-in screen. */
export function ThemeSwitch({ width = 184 }: { width?: number | '100%' }) {
  const t = useT();
  const { choice, setChoice } = useAppTheme();
  return (
    <Dropdown
      label={t('theme.label')}
      options={THEME_CHOICES.map((c) => ({ value: c, label: t(`theme.${c}`) }))}
      value={choice}
      onChange={(v) => setChoice(v as ThemeChoice)}
      width={width}
    />
  );
}
