import type { AuthEvent, AuthSession } from '../store/auth';

export type GateState =
  | { status: 'loading' }
  | { status: 'signedOut'; notice: 'ended' | null }
  | { status: 'signedIn'; session: AuthSession };

export const gateAfterSession = (session: AuthSession | null): GateState =>
  session ? { status: 'signedIn', session } : { status: 'signedOut', notice: null };

/**
 * The next state after the auth service reports a change. The same user reported again (the real service repeats
 * "signed in" when a tab regains focus) returns the very same state object, so the app below is not rebuilt.
 */
export function gateAfterEvent(state: GateState, session: AuthSession | null, event: AuthEvent): GateState {
  if (event === 'signed_in') {
    if (!session) return state;
    if (state.status === 'signedIn' && state.session.userId === session.userId) return state;
    return { status: 'signedIn', session };
  }
  if (event === 'session_ended') {
    return state.status === 'signedOut' ? state : { status: 'signedOut', notice: 'ended' };
  }
  return { status: 'signedOut', notice: null };
}
