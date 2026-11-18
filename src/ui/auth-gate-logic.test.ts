import { describe, expect, it } from 'vitest';
import { gateAfterEvent, gateAfterSession, type GateState } from './auth-gate-logic';

const ann = { userId: 'u1', email: 'ann@example.test' };
const bob = { userId: 'u2', email: 'bob@example.test' };

describe('gateAfterSession', () => {
  it('shows the app for a restored session and the sign-in screen without one', () => {
    expect(gateAfterSession(ann)).toEqual({ status: 'signedIn', session: ann });
    expect(gateAfterSession(null)).toEqual({ status: 'signedOut', notice: null });
  });
});

describe('gateAfterEvent', () => {
  const signedIn: GateState = { status: 'signedIn', session: ann };
  const signedOut: GateState = { status: 'signedOut', notice: null };

  it('signs in from the sign-in screen and while loading', () => {
    expect(gateAfterEvent(signedOut, ann, 'signed_in')).toEqual({ status: 'signedIn', session: ann });
    expect(gateAfterEvent({ status: 'loading' }, ann, 'signed_in')).toEqual({ status: 'signedIn', session: ann });
  });

  it('keeps the very same state when the same user is reported again, so the app is not rebuilt', () => {
    expect(gateAfterEvent(signedIn, { ...ann }, 'signed_in')).toBe(signedIn);
  });

  it('switches to another user', () => {
    expect(gateAfterEvent(signedIn, bob, 'signed_in')).toEqual({ status: 'signedIn', session: bob });
  });

  it('a sign-out that the person asked for shows the sign-in screen without a notice', () => {
    expect(gateAfterEvent(signedIn, null, 'signed_out')).toEqual({ status: 'signedOut', notice: null });
  });

  it('a session that ended by itself shows the sign-in screen with the notice', () => {
    expect(gateAfterEvent(signedIn, null, 'session_ended')).toEqual({ status: 'signedOut', notice: 'ended' });
  });

  it('does not add a notice to a screen that already asks for a sign-in', () => {
    expect(gateAfterEvent(signedOut, null, 'session_ended')).toBe(signedOut);
    expect(gateAfterEvent({ status: 'signedOut', notice: 'ended' }, null, 'signed_out')).toEqual({ status: 'signedOut', notice: null });
  });

  it('ignores a signed_in event without a session', () => {
    expect(gateAfterEvent(signedOut, null, 'signed_in')).toBe(signedOut);
  });
});
