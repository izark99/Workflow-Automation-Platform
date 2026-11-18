import { afterEach, describe, expect, it } from 'vitest';
import { ENGINE_MESSAGES } from '../../engine/messages';
import { coded } from '../../engine/types';
import { MemoryAuth, authErrorFrom } from '../../store/auth';
import { STORE_MESSAGES } from '../../store/messages';
import { storeError } from '../../store/types';
import { resetCatalog, setLocale, setOverrides } from './catalog';
import { errorText } from './error-text';
import { placeholdersOf } from './format';
import { en } from './messages/en';

afterEach(() => resetCatalog());

describe('error codes have catalog texts', () => {
  const all = { ...ENGINE_MESSAGES, ...STORE_MESSAGES } as Record<string, string>;
  it.each(Object.entries(all))('%s: the en text is the engine or store template, with the same placeholders', (id, template) => {
    const text = (en as Record<string, string>)[id];
    expect(text, `${id} is missing from en.ts`).toBeDefined();
    expect(text).toBe(template);
    expect(placeholdersOf(text!)).toEqual(placeholdersOf(template));
  });
});

describe('errorText', () => {
  it('shows the catalog text of the id in the language of the user', () => {
    const e = coded('node_failed', 'engine.noResult', { step: 's1' }, 's1');
    expect(errorText(e)).toBe('Step "s1" has no result to show. Run the flow first.');
    setOverrides({ vi: { 'engine.noResult': 'Bước "{step}" chưa có kết quả.' } });
    setLocale('vi');
    expect(errorText(e)).toBe('Bước "s1" chưa có kết quả.');
  });
  it('wraps the text in the pseudo-locale, for store and sign-in errors too', () => {
    setLocale('pseudo');
    expect(errorText(storeError('forbidden', 'errors.noUser'))).toBe('⟦No user is signed in. Sign in and try again.⟧');
    expect(errorText(authErrorFrom({ code: 'invalid_credentials' }))).toMatch(/^⟦The email or the password is wrong/);
  });
  it('falls back to the English message when there is no id or the catalog does not know it', () => {
    setLocale('pseudo');
    expect(errorText(new Error('Plain English.'))).toBe('Plain English.');
    const unknown = Object.assign(new Error('English fallback.'), { messageId: 'engine.noSuchId', params: {} });
    expect(errorText(unknown)).toBe('English fallback.');
    expect(errorText('text')).toBe('text');
    expect(errorText(undefined, 'Fallback')).toBe('Fallback');
  });
  it('the stand-in sign-in service throws an error with an id', async () => {
    const auth = new MemoryAuth({ users: [{ email: 'a@example.test', password: 'secret-password' }], storage: null });
    await expect(auth.signIn('a@example.test', 'wrong')).rejects.toMatchObject({ messageId: 'errors.auth.invalidCredentials' });
  });
});
