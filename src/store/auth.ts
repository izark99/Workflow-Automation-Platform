import { storeText } from './messages';
import type { StoreMessageId } from './messages';
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
  /** Sets a new password for the signed-in person. Throws AuthError with a message that says what to do. */
  changePassword(newPassword: string): Promise<void>;
  /** Called on every change from now on. Returns the function that stops it. */
  onChange(listener: (session: AuthSession | null, event: AuthEvent) => void): () => void;
}

export class AuthError extends Error {
  /** Id of the message in the catalog and its parameters. Without an id the English `message` is shown. */
  readonly messageId: string | undefined;
  readonly params: Record<string, string | number> | undefined;
  constructor(message: string, detail?: { messageId: string; params?: Record<string, string | number> }) {
    super(message);
    this.name = 'AuthError';
    this.messageId = detail?.messageId;
    this.params = detail?.params;
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

/** Which message a person reads when sign-in fails. It never says which of email and password is wrong. */
export function authFailure(error: AuthFailure): { id: StoreMessageId; params: Record<string, string> } {
  if (error.code === 'invalid_credentials') return { id: 'errors.auth.invalidCredentials', params: {} };
  if (error.code === 'user_banned') return { id: 'errors.auth.locked', params: {} };
  if (error.code === 'same_password') return { id: 'errors.auth.samePassword', params: {} };
  if (error.code === 'email_not_confirmed') return { id: 'errors.auth.emailNotConfirmed', params: {} };
  if (error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit' || error.status === 429) return { id: 'errors.auth.tooManyAttempts', params: {} };
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return { id: 'errors.auth.unreachable', params: {} };
  const detail = error.message?.trim();
  return detail ? { id: 'errors.auth.failedDetail', params: { detail } } : { id: 'errors.auth.failed', params: {} };
}

/** The English text of `authFailure`. */
export const authErrorMessage = (error: AuthFailure): string => {
  const f = authFailure(error);
  return storeText(f.id, f.params);
};

/** An AuthError for a failed sign-in, with its message id. */
export const authErrorFrom = (error: AuthFailure): AuthError => {
  const f = authFailure(error);
  return new AuthError(storeText(f.id, f.params), { messageId: f.id, params: f.params });
};

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * An AuthService that lives in the browser, for the dev and test builds (the e2e and UI-rules builds have no server).
 * The passwords are plain text on purpose: it is a stand-in for tests, never a way to protect data. A reload restores
 * the session from storage, like the real service does.
 */
export class MemoryAuth implements AuthService {
  private readonly users: { email: string; password: string; locked?: boolean }[];
  private readonly storage: KeyValueStorage | null;
  private readonly key: string;
  private listeners = new Set<(session: AuthSession | null, event: AuthEvent) => void>();

  constructor(options: { users: { email: string; password: string; locked?: boolean }[]; storage?: KeyValueStorage | null; key?: string }) {
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

  /** Adds a user or changes the password of one (the local account service). */
  setUser(email: string, password: string): void {
    const found = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (found) found.password = password;
    else this.users.push({ email, password });
  }

  setLocked(email: string, locked: boolean): void {
    const found = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (found) found.locked = locked;
  }

  /** Ends the session of that user when it is the open one (a lock or a password reset). */
  endSessionOf(email: string): void {
    if (this.current()?.email.toLowerCase() === email.toLowerCase()) this.expire();
  }

  getSession(): Promise<AuthSession | null> {
    return Promise.resolve(this.current());
  }

  signIn(email: string, password: string): Promise<AuthSession> {
    const user = this.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.password !== password) {
      return Promise.reject(authErrorFrom({ code: 'invalid_credentials' }));
    }
    if (user.locked) return Promise.reject(authErrorFrom({ code: 'user_banned' }));
    const session = { userId: `memory-${user.email.toLowerCase()}`, email: user.email };
    this.session = session;
    this.write(session);
    this.emit(session, 'signed_in');
    return Promise.resolve(session);
  }

  changePassword(newPassword: string): Promise<void> {
    const session = this.current();
    if (!session) return Promise.reject(authErrorFrom({ code: 'session_not_found' }));
    const user = this.users.find((u) => u.email.toLowerCase() === session.email.toLowerCase());
    if (user?.password === newPassword) return Promise.reject(authErrorFrom({ code: 'same_password' }));
    this.setUser(session.email, newPassword);
    return Promise.resolve();
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
