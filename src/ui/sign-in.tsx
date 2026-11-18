import { useState } from 'react';
import { AuthError, signInProblem, type AuthService } from '../store/auth';
import { Button, Card, ErrorState, Field, Icon, InfoTip } from './components';
import { useT, errorText } from './i18n';
import { ThemeSwitch } from './theme-switch';
import styles from './sign-in.module.css';


/** The screen of a person who is not signed in. Shown instead of the app, so no data is loaded behind it. */
export function SignInScreen({ auth, ended }: { auth: AuthService; ended: boolean }) {
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
        <ThemeSwitch width={160} />
      </div>
      <div className={styles.card}>
        <div className={styles.brand}>
          <Icon name="flow" size={22} />
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
