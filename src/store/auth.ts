// Sign-in, separate from the data (decision D67). The app asks an AuthService who is signed in; the data store
// asks Supabase with the same session. The local build has no sign-in, so it has no AuthService.

export interface AuthSession {
  userId: string;
  email: string;
}

/** Why the listener is called: a person signed in, a person signed out, or the session ended by itself (expired, or signed out in another tab). */
export type AuthEvent = 'signed_in' | 'signed_out' | 'session_ended';

export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  /** Throws AuthError with a message that says what to do. */
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  /** Called on every change from now on. Returns the function that stops it. */
  onChange(listener: (session: AuthSession | null, event: AuthEvent) => void): () => void;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/** What is wrong with the form before it is sent. The UI turns the code into a text of the catalog (`signIn.problem.{code}`). */
export interface SignInProblem {
  code: 'emailMissing' | 'emailInvalid' | 'passwordMissing';
  /** The address as typed, for `emailInvalid`. */
  email?: string;
}

export function signInProblem(email: string, password: string): SignInProblem | null {
  const e = email.trim();
  if (!e) return { code: 'emailMissing' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { code: 'emailInvalid', email: e };
  if (!password) return { code: 'passwordMissing' };
  return null;
}

interface AuthFailure {
  code?: string;
  name?: string;
  status?: number;
  message?: string;
}

/** The message a person reads when sign-in fails. It never says which of email and password is wrong. */
export function authErrorMessage(error: AuthFailure): string {
  if (error.code === 'invalid_credentials') return 'The email or the password is wrong. Check both and try again.';
  if (error.code === 'email_not_confirmed') {
    return 'This email address is not confirmed yet. Open the confirmation message that was sent to it, then sign in.';
  }
  if (error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'Could not reach the server. Check your connection and try again.';
  const detail = error.message?.trim();
  return detail
    ? `Sign-in failed: ${detail}. Try again, or ask the admin if it keeps failing.`
    : 'Sign-in failed. Try again, or ask the admin if it keeps failing.';
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * An AuthService that lives in the browser, for the dev and test builds (the e2e and UI-rules builds have no server).
 * The passwords are plain text on purpose: it is a stand-in for tests, never a way to protect data. A reload restores
 * the session from storage, like the real service does.
 */
export class MemoryAuth implements AuthService {
  private readonly users: { email: string; password: string }[];
  private readonly storage: KeyValueStorage | null;
  private readonly key: string;
  private listeners = new Set<(session: AuthSession | null, event: AuthEvent) => void>();

  constructor(options: { users: { email: string; password: string }[]; storage?: KeyValueStorage | null; key?: string }) {
    this.users = options.users;
    this.storage = options.storage ?? null;
    this.key = options.key ?? 'dfw.authSession';
  }

  private read(): AuthSession | null {
    try {
      const raw = this.storage?.getItem(this.key);
      return raw ? (JSON.parse(raw) as AuthSession) : null;
    } catch {
      return null;
    }
  }

  private write(session: AuthSession | null): void {
    try {
      if (session) this.storage?.setItem(this.key, JSON.stringify(session));
      else this.storage?.removeItem(this.key);
    } catch {
      // Storage can be blocked; the session then lasts until the page is closed.
    }
  }

  private session: AuthSession | null | undefined;

  private current(): AuthSession | null {
    if (this.session === undefined) this.session = this.read();
    return this.session;
  }

  private emit(session: AuthSession | null, event: AuthEvent): void {
    for (const l of [...this.listeners]) l(session, event);
  }

  getSession(): Promise<AuthSession | null> {
    return Promise.resolve(this.current());
  }

  signIn(email: string, password: string): Promise<AuthSession> {
    const user = this.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.password !== password) {
      return Promise.reject(new AuthError(authErrorMessage({ code: 'invalid_credentials' })));
    }
    const session = { userId: `memory-${user.email.toLowerCase()}`, email: user.email };
    this.session = session;
    this.write(session);
    this.emit(session, 'signed_in');
    return Promise.resolve(session);
  }

  signOut(): Promise<void> {
    this.session = null;
    this.write(null);
    this.emit(null, 'signed_out');
    return Promise.resolve();
  }

  /** The session ends by itself (a test of the "your session ended" path). Nothing happens when nobody is signed in. */
  expire(): void {
    if (!this.current()) return;
    this.session = null;
    this.write(null);
    this.emit(null, 'session_ended');
  }

  onChange(listener: (session: AuthSession | null, event: AuthEvent) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}
