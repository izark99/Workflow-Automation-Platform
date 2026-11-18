import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthService, AuthSession } from '../store/auth';
import { gateAfterEvent, gateAfterSession, type GateState } from './auth-gate-logic';
import { ChangePasswordScreen, LockedScreen } from './change-password';
import { SignInScreen } from './sign-in';
import { useStore } from './store-context';
import { useT } from './i18n';
import styles from './sign-in.module.css';

interface AuthInfo {
  session: AuthSession;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthInfo | null>(null);

/** Who is signed in and how to sign out. Null on the local store, where nobody signs in. */
export const useAuth = (): AuthInfo | null => useContext(AuthContext);

/**
 * Shows the app only for a signed-in person, the sign-in screen otherwise. The app below is keyed by the user, so
 * when another person signs in nothing of the previous person's screens is kept.
 */
export function AuthGate({ auth, children }: { auth: AuthService; children: ReactNode }) {
  const tr = useT();
  const [state, setState] = useState<GateState>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    const stop = auth.onChange((session, event) => {
      if (live) setState((s) => gateAfterEvent(s, session, event));
    });
    auth.getSession().then(
      (session) => live && setState((s) => (s.status === 'loading' ? gateAfterSession(session) : s)),
      () => live && setState((s) => (s.status === 'loading' ? { status: 'signedOut', notice: null } : s)),
    );
    return () => {
      live = false;
      stop();
    };
  }, [auth]);

  const session = state.status === 'signedIn' ? state.session : null;
  const info = useMemo<AuthInfo | null>(() => (session ? { session, signOut: () => auth.signOut(), changePassword: (p: string) => auth.changePassword(p) } : null), [session, auth]);

  if (state.status === 'loading') return <div className={styles.page} role="status" aria-busy="true" aria-label={tr('signIn.checking')} />;
  if (state.status === 'signedOut') return <SignInScreen auth={auth} ended={state.notice === 'ended'} />;
  return (
    <AuthContext.Provider key={state.session.userId} value={info}>
      <AccountGate auth={auth}>{children}</AccountGate>
    </AuthContext.Provider>
  );
}

/** How often a signed-in session asks whether an admin has locked the account. A dev build can shorten it (`dfw.statusPollMs`). */
const STATUS_POLL_MS = 30_000;
const pollMs = (): number => {
  try {
    const raw = import.meta.env.DEV || import.meta.env.VITE_DEV_ROUTES === 'true' ? localStorage.getItem('dfw.statusPollMs') : null;
    return raw ? Number(raw) || STATUS_POLL_MS : STATUS_POLL_MS;
  } catch {
    return STATUS_POLL_MS;
  }
};

type AccountState = { status: 'checking' } | { status: 'ok' } | { status: 'locked' } | { status: 'mustChange' };

/**
 * Between the sign-in and the app: a locked account sees the locked screen, an account that must change its password
 * sees only the change-password screen (SPEC 11.1). It asks again every 30 seconds and when the window is used again,
 * so a session that an admin locks meanwhile ends with a clear message. If the status cannot be read the app is shown:
 * the database refuses a locked account anyway.
 */
function AccountGate({ auth, children }: { auth: AuthService; children: ReactNode }) {
  const store = useStore();
  const tr = useT();
  const [state, setState] = useState<AccountState>({ status: 'checking' });

  useEffect(() => {
    let live = true;
    const check = (): void => {
      store.accountStatus().then(
        (s) => live && setState(s.locked ? { status: 'locked' } : s.mustChangePassword ? { status: 'mustChange' } : { status: 'ok' }),
        () => live && setState((old) => (old.status === 'checking' ? { status: 'ok' } : old)),
      );
    };
    check();
    const timer = window.setInterval(check, pollMs());
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, [store]);

  if (state.status === 'checking') return <div className={styles.page} role="status" aria-busy="true" aria-label={tr('signIn.checking')} />;
  if (state.status === 'locked') return <LockedScreen onSignOut={() => void auth.signOut()} />;
  if (state.status === 'mustChange') {
    return (
      <ChangePasswordScreen
        onSignOut={() => void auth.signOut()}
        onSave={async (password) => {
          await auth.changePassword(password);
          await store.clearMustChangePassword();
          setState({ status: 'ok' });
        }}
      />
    );
  }
  return <>{children}</>;
}
