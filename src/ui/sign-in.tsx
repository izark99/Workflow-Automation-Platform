import { useState } from 'react';
import { AuthError, signInProblem, type AuthService } from '../store/auth';
import { Button, Card, ErrorState, Field, Icon } from './components';
import { strings } from './strings';
import { ThemeSwitch } from './theme-switch';
import styles from './sign-in.module.css';

const t = strings.signIn;

/** The screen of a person who is not signed in. Shown instead of the app, so no data is loaded behind it. */
export function SignInScreen({ auth, ended }: { auth: AuthService; ended: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const found = signInProblem(email, password);
    if (found) {
      setProblem(found);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await auth.signIn(email, password);
      // The gate switches to the app when the service reports the sign-in.
    } catch (e) {
      setProblem(e instanceof AuthError ? e.message : `Sign-in failed. Try again, or ask the admin if it keeps failing.`);
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
          {strings.brand}
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
              <h1 className={styles.title}>{t.title}</h1>
              <p className={styles.subtitle}>{t.subtitle}</p>
            </div>
            {ended && !problem ? <ErrorState what={t.ended} next={t.endedNext} /> : null}
            <Field label={t.email} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus spellCheck={false} />
            <Field label={t.password} secret value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            {problem ? <ErrorState what={t.failed} next={problem} /> : null}
            <Button variant="primary" type="submit" busy={busy} block>
              {t.submit}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
