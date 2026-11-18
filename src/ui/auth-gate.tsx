import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthService, AuthSession } from '../store/auth';
import { gateAfterEvent, gateAfterSession, type GateState } from './auth-gate-logic';
import { SignInScreen } from './sign-in';
import { strings } from './strings';
import styles from './sign-in.module.css';

interface AuthInfo {
  session: AuthSession;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthInfo | null>(null);

/** Who is signed in and how to sign out. Null on the local store, where nobody signs in. */
export const useAuth = (): AuthInfo | null => useContext(AuthContext);

/**
 * Shows the app only for a signed-in person, the sign-in screen otherwise. The app below is keyed by the user, so
 * when another person signs in nothing of the previous person's screens is kept.
 */
export function AuthGate({ auth, children }: { auth: AuthService; children: ReactNode }) {
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
  const info = useMemo<AuthInfo | null>(() => (session ? { session, signOut: () => auth.signOut() } : null), [session, auth]);

  if (state.status === 'loading') return <div className={styles.page} role="status" aria-busy="true" aria-label={strings.signIn.checking} />;
  if (state.status === 'signedOut') return <SignInScreen auth={auth} ended={state.notice === 'ended'} />;
  return (
    <AuthContext.Provider key={state.session.userId} value={info}>
      {children}
    </AuthContext.Provider>
  );
}
