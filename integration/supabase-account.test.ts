// The own account against the real local Auth and database: the password change that an admin asks for, and a locked
// account. Run it with `npm run test:store`.
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthError, StoreError, SupabaseAuth, SupabaseStore } from '../src/store';

const URL = process.env.STORE_API_URL ?? '';
const ANON = process.env.STORE_ANON_KEY ?? '';
const SERVICE = process.env.STORE_SERVICE_KEY ?? '';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(URL, SERVICE, options);
const PASSWORD = 'integration-account-password-1';

let adminId = '';
const created: string[] = [];

const makeUser = async (email: string): Promise<string> => {
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create ${email}: ${error?.message}`);
  created.push(data.user.id);
  return data.user.id;
};
const session = async (email: string, password = PASSWORD) => {
  const client = createClient(URL, ANON, options);
  const auth = new SupabaseAuth(client);
  await auth.signIn(email, password);
  return { client, auth, store: new SupabaseStore(client) };
};
const refused = async (p: Promise<unknown>): Promise<AuthError | StoreError> => {
  try {
    await p;
  } catch (e) {
    expect(e instanceof AuthError || e instanceof StoreError).toBe(true);
    return e as AuthError | StoreError;
  }
  throw new Error('The call was expected to be refused, and it succeeded.');
};

beforeAll(async () => {
  expect(URL && ANON && SERVICE, 'run this test with npm run test:store').toBeTruthy();
  adminId = await makeUser('account.admin@example.test');
  const promoted = await service.from('profiles').update({ role: 'admin' }).eq('id', adminId);
  if (promoted.error) throw new Error(promoted.error.message);
});

// The other integration tests count users and admins, so this file leaves none behind.
afterAll(async () => {
  for (const id of created) await service.auth.admin.deleteUser(id);
});

describe('a password change that an admin asked for', () => {
  it('shows the flag, takes a new password, clears the flag, and signs in with the new password only', async () => {
    const email = 'must.change@example.test';
    const id = await makeUser(email);
    expect((await service.rpc('admin_set_must_change_password', { p_actor: adminId, p_user: id, p_value: true })).error).toBeNull();

    const s = await session(email);
    expect(await s.store.accountStatus()).toEqual({ locked: false, mustChangePassword: true });
    expect((await s.store.currentUser()).mustChangePassword).toBe(true);

    const same = await refused(s.auth.changePassword(PASSWORD));
    expect(same.messageId).toBe('errors.auth.samePassword');

    await s.auth.changePassword('a-brand-new-password-2');
    await s.store.clearMustChangePassword();
    expect(await s.store.accountStatus()).toEqual({ locked: false, mustChangePassword: false });
    await s.auth.signOut();

    expect((await refused(session(email, PASSWORD))).messageId).toBe('errors.auth.invalidCredentials');
    const again = await session(email, 'a-brand-new-password-2');
    expect(await again.store.accountStatus()).toEqual({ locked: false, mustChangePassword: false });
  });
});

describe('a locked account', () => {
  it('says it is locked instead of "no profile", also with a session that was open before the lock', async () => {
    const email = 'locked.person@example.test';
    const id = await makeUser(email);
    const s = await session(email);
    expect((await s.store.currentUser()).id).toBe(id);

    expect((await service.rpc('admin_set_locked', { p_actor: adminId, p_user: id, p_locked: true })).error).toBeNull();
    expect(await s.store.accountStatus()).toEqual({ locked: true, mustChangePassword: false });
    const e = await refused(s.store.currentUser());
    expect(e.messageId).toBe('errors.accountLocked');
    expect(await s.store.listFlows()).toEqual([]); // the database returns nothing to a locked account
    // once unlocked the same session works again
    expect((await service.rpc('admin_set_locked', { p_actor: adminId, p_user: id, p_locked: false })).error).toBeNull();
    expect((await s.store.currentUser()).id).toBe(id);
  });

  it('cannot sign in after the ban of Auth, and the message says the account is locked', async () => {
    const email = 'banned.person@example.test';
    const id = await makeUser(email);
    const banned = await service.auth.admin.updateUserById(id, { ban_duration: '876000h' });
    expect(banned.error).toBeNull();
    const e = await refused(session(email));
    expect(e).toBeInstanceOf(AuthError);
    expect(e.messageId).toBe('errors.auth.locked');
  });
});
