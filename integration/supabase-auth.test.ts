// SupabaseAuth against the real local Auth service. Run it with `npm run test:store`.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthError, SupabaseAuth, SupabaseStore, type AuthEvent } from '../src/store';

const URL = process.env.STORE_API_URL ?? '';
const ANON = process.env.STORE_ANON_KEY ?? '';
const SERVICE = process.env.STORE_SERVICE_KEY ?? '';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(URL, SERVICE, options);

const EMAIL = 'sign.in.person@example.test';
const PASSWORD = 'integration-test-password-2';
let userId = '';

const fresh = () => {
  const client = createClient(URL, ANON, options);
  return { client, auth: new SupabaseAuth(client) };
};

const refused = async (promise: Promise<unknown>): Promise<AuthError> => {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(AuthError);
    return e as AuthError;
  }
  throw new Error('The call was expected to be refused, and it succeeded.');
};

beforeAll(async () => {
  expect(URL && ANON && SERVICE, 'run this test with npm run test:store').toBeTruthy();
  const { data, error } = await service.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { name: 'Sam Signin' } });
  if (error || !data.user) throw new Error(`Could not create the user: ${error?.message}`);
  userId = data.user.id;
});

describe('SupabaseAuth', () => {
  it('has no session before anybody signs in', async () => {
    expect(await fresh().auth.getSession()).toBeNull();
  });

  it('refuses a wrong password and an unknown email with the same message', async () => {
    const { auth } = fresh();
    const wrong = await refused(auth.signIn(EMAIL, 'not-the-password'));
    const unknown = await refused(auth.signIn('nobody@example.test', PASSWORD));
    expect(wrong.message).toBe('The email or the password is wrong. Check both and try again.');
    expect(unknown.message).toBe(wrong.message);
    expect(await auth.getSession()).toBeNull();
  });

  it('signs in, and the same client then serves the data store as that user', async () => {
    const { client, auth } = fresh();
    const session = await auth.signIn(`  ${EMAIL.toUpperCase()}  `, PASSWORD);
    expect(session).toEqual({ userId, email: EMAIL });
    expect(await auth.getSession()).toEqual(session);
    const me = await new SupabaseStore(client).currentUser();
    expect(me).toMatchObject({ id: userId, name: 'Sam Signin', email: EMAIL, role: 'user' });
  });

  it('tells a listener about a sign-in and a sign-out the person asked for', async () => {
    const { auth } = fresh();
    const seen: AuthEvent[] = [];
    const stop = auth.onChange((_s, e) => seen.push(e));
    await auth.signIn(EMAIL, PASSWORD);
    await auth.signOut();
    expect(seen).toEqual(['signed_in', 'signed_out']);
    expect(await auth.getSession()).toBeNull();
    stop();
  });

  it('calls a sign-out that the page did not ask for a session that ended', async () => {
    const { client, auth } = fresh();
    await auth.signIn(EMAIL, PASSWORD);
    const seen: AuthEvent[] = [];
    auth.onChange((_s, e) => seen.push(e));
    await client.auth.signOut(); // not through SupabaseAuth.signOut: the way an expired or revoked session looks
    await new Promise((r) => setTimeout(r, 200));
    expect(seen).toEqual(['session_ended']);
  });

  it('stops telling a listener after it is stopped', async () => {
    const { auth } = fresh();
    const seen: AuthEvent[] = [];
    auth.onChange((_s, e) => seen.push(e))();
    await auth.signIn(EMAIL, PASSWORD);
    await auth.signOut();
    expect(seen).toEqual([]);
  });
});
