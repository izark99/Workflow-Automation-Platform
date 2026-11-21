import { useState } from 'react';
import { Button, Card, ErrorState, Field, InfoTip } from './components';
import { errorText, useT } from './i18n';
import { LanguageSwitch } from './language-switch';
import { MIN_PASSWORD_LENGTH } from '../store/accounts';
import { ThemeSwitch } from './theme-switch';
import styles from './sign-in.module.css';

/** The two fields of a new password and what is wrong with them, or null. */
export function newPasswordProblem(password: string, confirm: string): 'short' | 'mismatch' | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'short';
  return password === confirm ? null : 'mismatch';
}

/** The form of a new password. `onSave` throws when the password cannot be changed. */
export function NewPasswordForm({ onSave, submitLabel }: { onSave: (password: string) => Promise<void>; submitLabel: string }) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (): Promise<void> => {
    const found = newPasswordProblem(password, confirm);
    if (found) {
      setProblem(found === 'short' ? t('errors.account.passwordShort', { min: MIN_PASSWORD_LENGTH }) : t('signIn.change.mismatch'));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await onSave(password);
    } catch (e) {
      setProblem(errorText(e, t('signIn.change.failed')));
      setBusy(false);
    }
  };
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label={t('signIn.change.new')} hint={t('signIn.change.newHint')} secret autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <Field label={t('signIn.change.confirm')} secret autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {problem ? <ErrorState what={t('signIn.change.failed')} next={problem} /> : null}
      <Button variant="primary" type="submit" busy={busy} block>
        {submitLabel}
      </Button>
    </form>
  );
}

/** Shown instead of the app while the account has to change its password (SPEC 11.1). Same layout as the sign-in screen. */
export function ChangePasswordScreen({ onSave, onSignOut }: { onSave: (password: string) => Promise<void>; onSignOut: () => void }) {
  const t = useT();
  return (
    <main className={styles.page}>
      <div className={styles.prefs}>
        <LanguageSwitch width={140} />
        <ThemeSwitch width={140} />
      </div>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          {t('app.brand')}
        </div>
        <Card>
          <div className={styles.form}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{t('signIn.change.title')}</h1>
              <InfoTip label={t('signIn.change.title')}>{t('signIn.change.subtitle')}</InfoTip>
            </div>
            <NewPasswordForm onSave={onSave} submitLabel={t('signIn.change.submit')} />
            <Button size="sm" onClick={onSignOut}>
              {t('nav.signOut')}
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}

/** Shown instead of the app when an admin locked the account, at sign-in or while the session is open. */
export function LockedScreen({ onSignOut }: { onSignOut: () => void }) {
  const t = useT();
  return (
    <main className={styles.page}>
      <div className={styles.prefs}>
        <LanguageSwitch width={140} />
        <ThemeSwitch width={140} />
      </div>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          {t('app.brand')}
        </div>
        <Card>
          <div className={styles.form}>
            <h1 className={styles.title}>{t('signIn.locked.title')}</h1>
            <ErrorState what={t('signIn.locked.what')} next={t('signIn.locked.text')} />
            <Button variant="primary" onClick={onSignOut}>
              {t('nav.signOut')}
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
