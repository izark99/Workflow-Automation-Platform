// AuthService on Supabase Auth. The same client also serves SupabaseStore, so a sign-in here is the session there.
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AuthError, authErrorFrom, type AuthEvent, type AuthService, type AuthSession } from './auth';
import { storeText } from './messages';

const toSession = (s: Session | null): AuthSession | null => (s?.user ? { userId: s.user.id, email: s.user.email ?? '' } : null);

export class SupabaseAuth implements AuthService {
  /** True while signOut runs, so that its own SIGNED_OUT event is told apart from a session that ended by itself. */
  private signingOut = false;

  constructor(private readonly client: SupabaseClient) {}

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) return null;
    return toSession(data.session);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    const session = toSession(data.session);
    if (error || !session) throw authErrorFrom(error ?? {});
    return session;
  }

  async signOut(): Promise<void> {
    this.signingOut = true;
    try {
      const { error } = await this.client.auth.signOut();
      if (error) throw new AuthError(storeText('errors.auth.signOutFailed', { detail: error.message }), { messageId: 'errors.auth.signOutFailed', params: { detail: error.message } });
    } finally {
      this.signingOut = false;
    }
  }

  onChange(listener: (session: AuthSession | null, event: AuthEvent) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      // Never call the client from inside this callback: it can deadlock the client (a documented limit).
      if (event === 'SIGNED_IN') listener(toSession(session), 'signed_in');
      else if (event === 'SIGNED_OUT') listener(null, this.signingOut ? 'signed_out' : 'session_ended');
    });
    return () => data.subscription.unsubscribe();
  }
}
