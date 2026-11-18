import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { GENERATED_PASSWORD_LENGTH, LocalAccountAdmin, MIN_PASSWORD_LENGTH, accountErrorFrom, checkAccountInput, generatePassword } from './accounts';
import { MemoryAuth } from './auth';
import { LocalStore, MemoryAdapter } from './local-store';
import { STORE_MESSAGES } from './messages';
import { seedSnapshot } from './seed';
import { StoreError } from './types';

const code = async (p: Promise<unknown>): Promise<string> => p.then(() => 'ok', (e: unknown) => (e instanceof StoreError ? `${e.code}:${e.messageId ?? ''}` : 'other'));

describe('generatePassword', () => {
  it('makes 16 characters from an alphabet without look-alike pairs', () => {
    const p = generatePassword();
    expect(p).toHaveLength(GENERATED_PASSWORD_LENGTH);
    expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    expect(p.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
  });
  it('is random and takes its bytes from the source it is given', () => {
    expect(new Set(Array.from({ length: 50 }, () => generatePassword())).size).toBe(50);
    const fixed = generatePassword(5, (a) => a.fill(1));
    expect(fixed).toBe('BBBBB');
  });
  it('skips bytes that would bias the choice', () => {
    let call = 0;
    const out = generatePassword(3, (a) => {
      call += 1;
      return call === 1 ? a.fill(255) : a.fill(0);
    });
    expect(out).toBe('AAA');
  });
});

describe('checkAccountInput', () => {
  it('says what is wrong', () => {
    expect(() => checkAccountInput({ email: 'nope' })).toThrowError(/not an email address/);
    expect(() => checkAccountInput({ password: 'short' })).toThrowError(/at least 10 characters/);
    expect(() => checkAccountInput({ role: 'owner' })).toThrowError(/user or admin/);
    expect(() => checkAccountInput({ email: ' a@b.co ', password: '0123456789', role: 'admin' })).not.toThrow();
  });
});

describe('accountErrorFrom', () => {
  it('turns the answer of the function into a StoreError with its message id', () => {
    const e = accountErrorFrom({ error: { code: 'conflict', messageId: 'errors.account.selfLock', params: {}, message: 'You cannot lock your own account. Ask another admin.' } });
    expect(e).toMatchObject({ code: 'conflict', messageId: 'errors.account.selfLock', message: 'You cannot lock your own account. Ask another admin.' });
    expect(accountErrorFrom({ error: { code: 'unauthenticated', messageId: 'errors.account.signedOut', message: 'x' } }).code).toBe('forbidden');
    expect(accountErrorFrom(null)).toMatchObject({ messageId: 'errors.account.unreachable' });
    expect(accountErrorFrom('<html>')).toMatchObject({ messageId: 'errors.account.unreachable' });
  });
  it('the Edge Function keeps the same English templates as the store messages', () => {
    const source = readFileSync('supabase/functions/admin-users/index.ts', 'utf8');
    const copy = Object.fromEntries([...source.matchAll(/^\s+'(errors\.account\.\w+)': '((?:[^'\\]|\\.)*)',$/gm)].map((m) => [m[1]!, m[2]!.replace(/\\'/g, "'")]));
    expect(Object.keys(copy).length).toBeGreaterThanOrEqual(11);
    for (const [id, text] of Object.entries(copy)) expect((STORE_MESSAGES as Record<string, string>)[id], id).toBe(text);
  });
});

describe('LocalAccountAdmin', () => {
  let store: LocalStore;
  let auth: MemoryAuth;
  let accounts: LocalAccountAdmin;
  beforeEach(() => {
    store = new LocalStore({ adapter: new MemoryAdapter(), seed: seedSnapshot, now: () => new Date('2026-11-17T08:00:00.000Z') });
    auth = new MemoryAuth({ users: [{ email: 'harold@example.com', password: 'correct horse battery' }], storage: null });
    accounts = new LocalAccountAdmin(store, auth);
  });

  it('creates an account that must change the password and can sign in', async () => {
    const user = await accounts.createAccount({ email: 'new@example.com', name: 'New Person', password: 'a-long-password', role: 'user' });
    expect(user).toMatchObject({ name: 'New Person', email: 'new@example.com', role: 'user', locked: false, mustChangePassword: true });
    expect((await store.listUsers()).find((u) => u.id === user.id)).toMatchObject({ locked: false, mustChangePassword: true });
    expect((await auth.signIn('new@example.com', 'a-long-password')).email).toBe('new@example.com');
  });

  it('refuses a bad input, an existing email, and a caller who is not an admin', async () => {
    expect(await code(accounts.createAccount({ email: 'x', password: 'a-long-password', role: 'user' }))).toBe('invalid:errors.account.emailInvalid');
    expect(await code(accounts.createAccount({ email: 'x@example.com', password: 'short', role: 'user' }))).toBe('invalid:errors.account.passwordShort');
    expect(await code(accounts.createAccount({ email: 'LAN@example.com', password: 'a-long-password', role: 'user' }))).toBe('conflict:errors.account.emailTaken');
    await store.switchUser('user-lan');
    expect(await code(accounts.createAccount({ email: 'y@example.com', password: 'a-long-password', role: 'user' }))).toBe('forbidden:errors.adminOnly');
  });

  it('resets a password: the old one stops working, the flag is set, an open session ends', async () => {
    await auth.signIn('harold@example.com', 'correct horse battery');
    await accounts.resetPassword('user-harold', 'brand-new-password');
    expect((await auth.getSession())).toBeNull();
    await expect(auth.signIn('harold@example.com', 'correct horse battery')).rejects.toMatchObject({ messageId: 'errors.auth.invalidCredentials' });
    expect((await auth.signIn('harold@example.com', 'brand-new-password')).email).toBe('harold@example.com');
    expect((await store.listUsers()).find((u) => u.id === 'user-harold')?.mustChangePassword).toBe(true);
    expect(await code(accounts.resetPassword('user-harold', 'short'))).toBe('invalid:errors.account.passwordShort');
    expect(await code(accounts.resetPassword('nobody', 'a-long-password'))).toBe('not_found:errors.account.userMissing');
  });

  it('locks and unlocks: a locked user cannot use the store or sign in; an admin cannot lock themselves', async () => {
    await accounts.createAccount({ email: 'lan2@example.com', password: 'a-long-password', role: 'user' });
    await accounts.lock('user-lan');
    expect((await store.listUsers()).find((u) => u.id === 'user-lan')?.locked).toBe(true);
    await store.switchUser('user-lan');
    expect(await code(store.listFlows())).toBe('forbidden:errors.accountLocked');
    await store.switchUser('user-harold');
    await accounts.unlock('user-lan');
    await store.switchUser('user-lan');
    expect((await store.listFlows()).length).toBeGreaterThan(0);
    await store.switchUser('user-harold');
    expect(await code(accounts.lock('user-harold'))).toBe('conflict:errors.account.selfLock');
    expect(await code(accounts.lock('nobody'))).toBe('not_found:errors.account.userMissing');
  });

  it('keeps the last active admin', async () => {
    const second = await accounts.createAccount({ email: 'admin2@example.com', password: 'a-long-password', role: 'admin' });
    await accounts.lock(second.id); // another active admin remains (the signed-in one)
    await accounts.unlock(second.id);
    await store.switchUser(second.id);
    await accounts.lock('user-harold'); // the second admin locks the first: still one active admin (themselves)
    expect(await code(accounts.lock(second.id))).toBe('conflict:errors.account.selfLock');
  });

  it('the stand-in sign-in refuses a locked user and says why', async () => {
    await accounts.createAccount({ email: 'lock.me@example.com', password: 'a-long-password', role: 'user' });
    const created = (await store.listUsers()).find((u) => u.email === 'lock.me@example.com')!;
    await accounts.lock(created.id);
    await expect(auth.signIn('lock.me@example.com', 'a-long-password')).rejects.toMatchObject({ messageId: 'errors.auth.locked' });
    await accounts.unlock(created.id);
    expect((await auth.signIn('lock.me@example.com', 'a-long-password')).email).toBe('lock.me@example.com');
  });
});
