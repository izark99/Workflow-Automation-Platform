import { Dropdown } from './components';
import { getLocale, saveLocale, setLocale, useT } from './i18n';
import type { Locale } from './i18n';

const LANGUAGES = ['en', 'vi'] as const;

/** Language switch for the sidebar footer and the sign-in screen. The choice is kept in the browser (SPEC 11.3). */
export function LanguageSwitch({ width = 184 }: { width?: number }) {
  const t = useT();
  const current: Locale = getLocale();
  return (
    <Dropdown
      label={t('language.label')}
      options={LANGUAGES.map((l) => ({ value: l, label: t(`language.${l}`) }))}
      value={current === 'vi' ? 'vi' : 'en'}
      onChange={(v) => {
        const next = v === 'vi' ? 'vi' : 'en';
        setLocale(next);
        saveLocale(typeof localStorage === 'undefined' ? undefined : localStorage, next);
      }}
      width={width}
    />
  );
}
