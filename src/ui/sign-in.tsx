import { useState } from 'react';
import { AuthError, signInProblem, type AuthService } from '../store/auth';
import { Button, Card, ErrorState, Field, Icon, InfoTip } from './components';
import { useT, errorText } from './i18n';
import { activityTracker } from './session/tracker';
import { LanguageSwitch } from './language-switch';
import { ThemeSwitch } from './theme-switch';
import styles from './sign-in.module.css';


/** The screen of a person who is not signed in. Shown instead of the app, so no data is loaded behind it. */
export function SignInScreen({ auth, ended, idleHours }: { auth: AuthService; ended: boolean; /** Set when the inactivity limit ended the last session. */ idleHours?: number }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const found = signInProblem(email, password);
    if (found) {
      setProblem(t(`signIn.problem.${found.code}`, { email: found.email ?? '' }));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      // A person who types a password is active: the time of the last activity must be fresh before the app is shown.
      activityTracker().touch(true);
      await auth.signIn(email, password);
      // The gate switches to the app when the service reports the sign-in.
    } catch (e) {
      setProblem(e instanceof AuthError ? errorText(e) : t('signIn.failedGeneric'));
      setBusy(false);
    }
  };

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
          <form
            className={styles.form}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>{t('signIn.title')}</h1>
                <InfoTip label={t('signIn.title')}>{t('signIn.subtitle')}</InfoTip>
              </div>
            </div>
            {idleHours !== undefined ? (
              <p className={styles.quiet} role="status">
                <Icon name="info" size={16} />
                <span>{t('signIn.idleEnded', { hours: idleHours })}</span>
              </p>
            ) : null}
            {ended && !problem ? <ErrorState what={t('signIn.ended')} next={t('signIn.endedNext')} /> : null}
            <Field label={t('signIn.email')} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus spellCheck={false} />
            <Field label={t('signIn.password')} secret value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            {problem ? <ErrorState what={t('signIn.failed')} next={problem} /> : null}
            <Button variant="primary" type="submit" busy={busy} block>
              {t('signIn.submit')}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
