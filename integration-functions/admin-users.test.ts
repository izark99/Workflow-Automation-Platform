// Gate G6: the Edge Function `admin-users` on the local stack. Run it with `npm run test:functions`.
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const API = process.env.FUNCTIONS_API_URL ?? '';
const ANON = process.env.FUNCTIONS_ANON_KEY ?? '';
const SERVICE = process.env.FUNCTIONS_SERVICE_KEY ?? '';
const FUNCTION = `${API}/functions/v1/admin-users`;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const PASSWORD = 'integration-password-1';

const service: SupabaseClient = createClient(API, SERVICE, options);

interface Answer {
  status: number;
  // The JSON of the function, checked field by field in the tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

async function call(token: string | null, body: unknown, method = 'POST'): Promise<Answer> {
  const response = await fetch(FUNCTION, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: ANON, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

interface Account {
  id: string;
  email: string;
  token: string;
  refresh: string;
}

async function signIn(email: string, password = PASSWORD): Promise<{ token: string; refresh: string; error: string | null }> {
  const client = createClient(API, ANON, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  return { token: data.session?.access_token ?? '', refresh: data.session?.refresh_token ?? '', error: error?.message ?? null };
}

/** An account made straight in Auth (the profile comes from the trigger), with the role set in SQL. */
async function makeAccount(email: string, role: 'user' | 'admin'): Promise<Account> {
  const created = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message ?? 'no user');
  const id = created.data.user.id;
  if (role === 'admin') {
    const set = await service.from('profiles').update({ role: 'admin' }).eq('id', id);
    if (set.error) throw new Error(set.error.message);
  }
  const session = await signIn(email);
  expect(session.error, `sign-in of ${email}`).toBeNull();
  return { id, email, token: session.token, refresh: session.refresh };
}

const profileOf = async (id: string) => (await service.from('profiles').select('role, locked_at, must_change_password, name').eq('id', id).single()).data!;
const asUser = (token: string): SupabaseClient => createClient(API, ANON, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });

let admin: Account;
let second: Account;
let user: Account;

beforeAll(async () => {
  expect(API && ANON && SERVICE, 'run this test with npm run test:functions').toBeTruthy();
  admin = await makeAccount('admin.one@example.test', 'admin');
  second = await makeAccount('admin.two@example.test', 'admin');
  user = await makeAccount('plain.user@example.test', 'user');
});

describe('who may call it', () => {
  it('refuses a call with no token, with the anon key, and with a token that is not a user', async () => {
    // With no token or a bad one the gateway answers (its own body); with the anon key the function answers.
    for (const token of [null, ANON, 'not-a-token']) {
      const a = await call(token, { action: 'lock', user_id: user.id });
      expect(a.status, String(token)).toBe(401);
    }
    expect((await call(ANON, { action: 'lock', user_id: user.id })).body.error).toMatchObject({ code: 'unauthenticated', messageId: 'errors.account.signedOut' });
    expect((await profileOf(user.id)).locked_at).toBeNull();
  });

  it('refuses a user who is not an admin, for every action', async () => {
    for (const body of [
      { action: 'create', email: 'x@example.test', password: PASSWORD },
      { action: 'reset_password', user_id: second.id, password: PASSWORD },
      { action: 'lock', user_id: second.id },
      { action: 'unlock', user_id: second.id },
    ]) {
      const a = await call(user.token, body);
      expect(a.status, body.action).toBe(403);
      expect(a.body.error).toMatchObject({ code: 'forbidden', messageId: 'errors.account.notAdmin' });
    }
    expect((await profileOf(second.id)).locked_at).toBeNull();
  });

  it('refuses a locked admin whose token is still valid (the function checks the profile), and accepts the admin again after the unlock', async () => {
    const locked = await makeAccount('admin.locked@example.test', 'admin');
    // Straight in SQL, so the token stays valid: the function itself must refuse it.
    expect((await service.from('profiles').update({ locked_at: new Date().toISOString() }).eq('id', locked.id)).error).toBeNull();
    const refused = await call(locked.token, { action: 'create', email: 'nobody@example.test', password: PASSWORD });
    expect(refused.status).toBe(403);
    expect(refused.body.error.messageId).toBe('errors.account.notAdmin');
    expect((await service.from('profiles').select('id').eq('email', 'nobody@example.test')).data).toEqual([]);
    expect((await service.from('profiles').update({ locked_at: null }).eq('id', locked.id)).error).toBeNull();
    expect((await call(locked.token, { action: 'create', email: 'allowed@example.test', password: PASSWORD })).status).toBe(200);
  });

  it('locking an admin through the function ends their sessions, so the old token is refused too', async () => {
    const other = await makeAccount('admin.three@example.test', 'admin');
    expect((await call(admin.token, { action: 'lock', user_id: other.id })).status).toBe(200);
    expect([401, 403]).toContain((await call(other.token, { action: 'create', email: 'never@example.test', password: PASSWORD })).status);
    expect((await service.from('profiles').select('id').eq('email', 'never@example.test')).data).toEqual([]);
    expect((await call(admin.token, { action: 'unlock', user_id: other.id })).status).toBe(200);
  });

  it('refuses a request that is not understood', async () => {
    expect((await call(admin.token, 'this is not json')).status).toBe(400);
    expect((await call(admin.token, [1, 2])).status).toBe(400);
    expect((await call(admin.token, { action: 'delete', user_id: user.id })).body.error.messageId).toBe('errors.account.badRequest');
    expect((await call(admin.token, {}, 'GET')).status).toBe(400);
  });
});

describe('create', () => {
  it('makes an account that can sign in and must change the password', async () => {
    const a = await call(admin.token, { action: 'create', email: 'new.person@example.test', name: 'New Person', password: 'a-long-password-1' });
    expect(a.status).toBe(200);
    expect(a.body.user).toMatchObject({ email: 'new.person@example.test', name: 'New Person', role: 'user', locked: false, must_change_password: true });
    const session = await signIn('new.person@example.test', 'a-long-password-1');
    expect(session.error).toBeNull();
    const status = await asUser(session.token).rpc('account_status');
    expect(status.data).toEqual([{ locked: false, must_change_password: true }]);
    const cleared = await asUser(session.token).rpc('clear_must_change_password');
    expect(cleared.error).toBeNull();
    expect((await profileOf(a.body.user.id)).must_change_password).toBe(false);
  });

  it('can make an admin, and can leave the password flag off', async () => {
    const a = await call(admin.token, { action: 'create', email: 'new.admin@example.test', password: 'a-long-password-2', role: 'admin', must_change_password: false });
    expect(a.status).toBe(200);
    expect(a.body.user).toMatchObject({ role: 'admin', must_change_password: false });
    expect((await call((await signIn('new.admin@example.test', 'a-long-password-2')).token, { action: 'lock', user_id: user.id })).status).toBe(200);
    expect((await call(admin.token, { action: 'unlock', user_id: user.id })).status).toBe(200);
  });

  it('checks the input and says what to do', async () => {
    const bad = [
      [{ action: 'create', email: 'not-an-email', password: PASSWORD }, 400, 'errors.account.emailInvalid'],
      [{ action: 'create', email: 'short@example.test', password: 'too short' }, 400, 'errors.account.passwordShort'],
      [{ action: 'create', email: 'role@example.test', password: PASSWORD, role: 'owner' }, 400, 'errors.account.roleInvalid'],
      [{ action: 'create', email: 'plain.user@example.test', password: PASSWORD }, 409, 'errors.account.emailTaken'],
    ] as const;
    for (const [body, status, id] of bad) {
      const a = await call(admin.token, body);
      expect([a.status, a.body.error.messageId], JSON.stringify(body)).toEqual([status, id]);
      expect(a.body.error.message).toMatch(/\w/);
    }
    expect((await service.from('profiles').select('id').eq('email', 'role@example.test')).data).toEqual([]);
  });
});

describe('reset_password', () => {
  it('sets a new password, asks for another change, and ends the open sessions', async () => {
    const victim = await makeAccount('reset.me@example.test', 'user');
    const a = await call(admin.token, { action: 'reset_password', user_id: victim.id, password: 'brand-new-password' });
    expect(a.status).toBe(200);
    expect((await signIn(victim.email, PASSWORD)).error).not.toBeNull();
    expect((await signIn(victim.email, 'brand-new-password')).error).toBeNull();
    expect((await profileOf(victim.id)).must_change_password).toBe(true);
    const old = await createClient(API, ANON, options).auth.refreshSession({ refresh_token: victim.refresh });
    expect(old.error, 'the refresh token of the old session').not.toBeNull();
  });

  it('checks the input and the user', async () => {
    expect((await call(admin.token, { action: 'reset_password', user_id: user.id, password: 'short' })).body.error.messageId).toBe('errors.account.passwordShort');
    expect((await call(admin.token, { action: 'reset_password', user_id: 'nope', password: PASSWORD })).status).toBe(400);
    const missing = await call(admin.token, { action: 'reset_password', user_id: '00000000-0000-0000-0000-0000000000ff', password: PASSWORD });
    expect([missing.status, missing.body.error.messageId]).toEqual([404, 'errors.account.userMissing']);
  });
});

describe('lock and unlock', () => {
  it('a locked user with an open session reads and writes nothing, cannot sign in or refresh, and is back after the unlock', async () => {
    const person = await makeAccount('lock.me@example.test', 'user');
    const own = asUser(person.token);
    const made = await own.rpc('create_flow', { p_name: 'Before the lock', p_scope: 'personal' });
    expect(made.error).toBeNull();
    expect((await own.from('flows').select('id')).data).toHaveLength(1);

    expect((await call(admin.token, { action: 'lock', user_id: person.id })).status).toBe(200);
    expect((await profileOf(person.id)).locked_at).not.toBeNull();

    // the token that was issued before the lock is still valid for the gateway, and the database refuses it
    expect((await own.from('flows').select('id')).data).toEqual([]);
    expect((await own.from('profiles').select('id')).data).toEqual([]);
    expect((await own.rpc('create_flow', { p_name: 'After the lock', p_scope: 'personal' })).error).not.toBeNull();
    expect((await own.rpc('account_status')).data).toEqual([{ locked: true, must_change_password: false }]);
    // no new session: sign-in is banned, and the open session cannot refresh
    expect((await signIn(person.email)).error).not.toBeNull();
    expect((await createClient(API, ANON, options).auth.refreshSession({ refresh_token: person.refresh })).error).not.toBeNull();

    expect((await call(admin.token, { action: 'unlock', user_id: person.id })).status).toBe(200);
    const back = await signIn(person.email);
    expect(back.error).toBeNull();
    const names = (await asUser(back.token).from('flows').select('name')).data?.map((r) => r.name);
    expect(names).toEqual(['Before the lock']);
    expect((await service.from('flows').select('id').eq('name', 'After the lock')).data).toEqual([]);
  });

  it('an admin cannot lock themselves, and the answer says so', async () => {
    const a = await call(admin.token, { action: 'lock', user_id: admin.id });
    expect([a.status, a.body.error.messageId]).toEqual([409, 'errors.account.selfLock']);
    expect((await profileOf(admin.id)).locked_at).toBeNull();
    const status = await asUser(admin.token).from('profiles').select('id');
    expect(status.data?.length).toBeGreaterThan(0);
  });

  it('refuses an unknown user and a bad id', async () => {
    const missing = await call(admin.token, { action: 'lock', user_id: '00000000-0000-0000-0000-0000000000ff' });
    expect([missing.status, missing.body.error.messageId]).toEqual([404, 'errors.account.userMissing']);
    expect((await call(admin.token, { action: 'unlock', user_id: 'x' })).status).toBe(400);
  });

  it('the last active admin stays: the database refuses to lock or demote them, also for the service role', async () => {
    const admins = (await service.from('profiles').select('id, email').eq('role', 'admin').is('locked_at', null)).data!;
    // Lock every admin but one straight in SQL (the first of them is kept), then try to lock the one that is left.
    const keep = admins[0]!;
    for (const a of admins.slice(1)) await service.from('profiles').update({ locked_at: new Date().toISOString() }).eq('id', a.id);
    const locking = await service.from('profiles').update({ locked_at: new Date().toISOString() }).eq('id', keep.id);
    expect(locking.error?.message).toMatch(/at least one active admin/i);
    const demoting = await service.from('profiles').update({ role: 'user' }).eq('id', keep.id);
    expect(demoting.error?.message).toMatch(/at least one active admin/i);
    for (const a of admins.slice(1)) await service.from('profiles').update({ locked_at: null }).eq('id', a.id);
  });
});
