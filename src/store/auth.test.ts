import { describe, expect, it, vi } from 'vitest';
import { AuthError, MemoryAuth, authErrorMessage, signInProblem, type AuthEvent, type AuthSession } from './auth';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

describe('signInProblem', () => {
  it('asks for what is missing, with what to do', () => {
    expect(signInProblem('', 'x')).toEqual({ code: 'emailMissing' });
    expect(signInProblem('   ', 'x')).toEqual({ code: 'emailMissing' });
    expect(signInProblem('ann', 'x')).toEqual({ code: 'emailInvalid', email: 'ann' });
    expect(signInProblem('ann@example.test', '')).toEqual({ code: 'passwordMissing' });
  });

  it('accepts an email and a password', () => {
    expect(signInProblem(' ann@example.test ', 'secret')).toBeNull();
  });
});

describe('authErrorMessage', () => {
  it('names wrong credentials without saying which one is wrong', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 })).toBe(
      'The email or the password is wrong. Check both and try again.',
    );
  });

  it('explains an unconfirmed email, a rate limit and a lost connection', () => {
    expect(authErrorMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe(
      'This email address is not confirmed yet. Open the confirmation message that was sent to it, then sign in.',
    );
    expect(authErrorMessage({ code: 'over_request_rate_limit', message: 'rate', status: 429 })).toBe('Too many attempts. Wait a minute and try again.');
    expect(authErrorMessage({ status: 429, message: 'Too many requests' })).toBe('Too many attempts. Wait a minute and try again.');
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 })).toBe(
      'Could not reach the server. Check your connection and try again.',
    );
  });

  it('says what failed for anything else', () => {
    expect(authErrorMessage({ message: 'Database error' })).toBe('Sign-in failed: Database error. Try again, or ask the admin if it keeps failing.');
    expect(authErrorMessage({})).toBe('Sign-in failed. Try again, or ask the admin if it keeps failing.');
  });
});

describe('MemoryAuth', () => {
  const users = [{ email: 'Ann@Example.test', password: 'pw-ann' }];

  it('starts without a session', async () => {
    expect(await new MemoryAuth({ users, storage: memoryStorage() }).getSession()).toBeNull();
  });

  it('signs in with the right password, ignoring the case of the email', async () => {
    const auth = new MemoryAuth({ users, storage: memoryStorage() });
    const session = await auth.signIn(' ann@example.test ', 'pw-ann');
    expect(session.email).toBe('Ann@Example.test');
    expect(await auth.getSession()).toEqual(session);
  });

  it('refuses a wrong password or an unknown email with the same message', async () => {
    const auth = new MemoryAuth({ users, storage: memoryStorage() });
    const wrong = await auth.signIn('ann@example.test', 'nope').catch((e: unknown) => e);
    const unknown = await auth.signIn('bob@example.test', 'pw-ann').catch((e: unknown) => e);
    expect(wrong).toBeInstanceOf(AuthError);
    expect((wrong as AuthError).message).toBe('The email or the password is wrong. Check both and try again.');
    expect((unknown as AuthError).message).toBe((wrong as AuthError).message);
    expect(await auth.getSession()).toBeNull();
  });

  it('restores the session from storage, as a page reload does', async () => {
    const storage = memoryStorage();
    const first = new MemoryAuth({ users, storage });
    const session = await first.signIn('ann@example.test', 'pw-ann');
    expect(await new MemoryAuth({ users, storage }).getSession()).toEqual(session);
  });

  it('tells listeners about sign-in, sign-out and an ended session, and stops when asked', async () => {
    const auth = new MemoryAuth({ users, storage: memoryStorage() });
    const seen: [AuthSession | null, AuthEvent][] = [];
    const stop = auth.onChange((s, e) => seen.push([s, e]));
    const session = await auth.signIn('ann@example.test', 'pw-ann');
    await auth.signOut();
    await auth.signIn('ann@example.test', 'pw-ann');
    auth.expire();
    expect(seen).toEqual([
      [session, 'signed_in'],
      [null, 'signed_out'],
      [session, 'signed_in'],
      [null, 'session_ended'],
    ]);
    expect(await auth.getSession()).toBeNull();
    stop();
    const listener = vi.fn();
    const stop2 = auth.onChange(listener);
    stop2();
    await auth.signIn('ann@example.test', 'pw-ann');
    expect(listener).not.toHaveBeenCalled();
    expect(seen).toHaveLength(4);
  });

  it('ignores expire when nobody is signed in', () => {
    const auth = new MemoryAuth({ users, storage: memoryStorage() });
    const listener = vi.fn();
    auth.onChange(listener);
    auth.expire();
    expect(listener).not.toHaveBeenCalled();
  });
});
