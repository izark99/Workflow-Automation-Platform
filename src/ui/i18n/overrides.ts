import type { UiText } from '../../store/types';
import { setOverrides } from './catalog';

/** Applies the edited texts of the store over the catalog (SPEC 11.3). A text whose placeholders no longer match is dropped. */
export function applyUiTexts(texts: UiText[]): void {
  const byLocale: Record<string, Record<string, string>> = {};
  for (const t of texts) (byLocale[t.locale] ??= {})[t.key] = t.value;
  setOverrides(byLocale);
}
