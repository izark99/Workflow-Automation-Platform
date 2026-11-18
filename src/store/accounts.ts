import type { SupabaseClient } from '@supabase/supabase-js';
import { MemoryAuth } from './auth';
import type { LocalStore, Snapshot } from './local-store';
import { storeText } from './messages';
import type { StoreMessageId } from './messages';
import { StoreError, storeError } from './types';
import type { Role, StoreErrorCode, User } from './types';

// Account management by the admin (SPEC 11.1). Two implementations behind one interface: the Supabase one calls the
// Edge Function `admin-users`, the local one changes the snapshot of the local store (and the stand-in sign-in).

/** The password rule of SPEC 11.1: at least 10 characters. Nothing else is demanded. */
export const MIN_PASSWORD_LENGTH = 10;
export const GENERATED_PASSWORD_LENGTH = 16;

export interface NewAccount {
  email: string;
  name?: string;
  password: string;
  role: Role;
  /** Default true: the person chooses a new password at the first sign-in. */
  mustChangePassword?: boolean;
}

export interface AccountAdmin {
  /** Creates the account and returns the user as the Users tab shows it. */
  createAccount(input: NewAccount): Promise<User>;
  /** Sets a new password and, by default, asks for another change at the next sign-in. Open sessions end. */
  resetPassword(userId: string, password: string, mustChangePassword?: boolean): Promise<void>;
  /** The account cannot sign in and reads nothing at once. An admin cannot lock themselves or the last active admin. */
  lock(userId: string): Promise<void>;
  unlock(userId: string): Promise<void>;
}

// Letters and digits without the pairs that look alike (0 O, 1 l I): an admin may read the password to a person.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** A random password of 16 characters, from the secure random source of the browser. */
export function generatePassword(length: number = GENERATED_PASSWORD_LENGTH, fill: (a: Uint8Array<ArrayBuffer>) => Uint8Array = (a) => crypto.getRandomValues(a)): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length); // no modulo bias
  let out = '';
  while (out.length < length) {
    for (const byte of fill(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
    }
  }
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The checks that the Edge Function makes too, so the local store gives the same answers. */
export function checkAccountInput(input: { email?: string; password?: string; role?: string }): void {
  if (input.email !== undefined && !EMAIL.test(input.email.trim())) throw storeError('invalid', 'errors.account.emailInvalid', { email: input.email.trim() });
  if (input.password !== undefined && input.password.length < MIN_PASSWORD_LENGTH) throw storeError('invalid', 'errors.account.passwordShort', { min: MIN_PASSWORD_LENGTH });
  if (input.role !== undefined && input.role !== 'user' && input.role !== 'admin') throw storeError('invalid', 'errors.account.roleInvalid');
}

const FUNCTION_CODES: Record<string, StoreErrorCode> = { unauthenticated: 'forbidden', forbidden: 'forbidden', invalid: 'invalid', conflict: 'conflict', not_found: 'not_found', failed: 'invalid' };

/** A StoreError from the JSON that the Edge Function answers with (`{ error: { code, messageId, params, message } }`). */
export function accountErrorFrom(body: unknown): StoreError {
  const e = (body as { error?: { code?: string; messageId?: string; params?: Record<string, string | number>; message?: string } } | null)?.error;
  if (!e || typeof e.message !== 'string') return storeError('invalid', 'errors.account.unreachable');
  return new StoreError(FUNCTION_CODES[e.code ?? ''] ?? 'invalid', e.message, e.messageId ? { messageId: e.messageId, params: e.params ?? {} } : undefined);
}

interface FunctionResult {
  user?: { id: string; name: string; email: string; role: Role; locked?: boolean; must_change_password?: boolean };
}

export class SupabaseAccountAdmin implements AccountAdmin {
  constructor(private readonly client: SupabaseClient) {}

  private async invoke(body: Record<string, unknown>): Promise<FunctionResult> {
    const { data, error } = await this.client.functions.invoke('admin-users', { body });
    if (!error) return (data ?? {}) as FunctionResult;
    // A non-2xx answer carries the Response of the function; a network failure carries none.
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        throw accountErrorFrom(await context.json());
      } catch (e) {
        if (e instanceof StoreError) throw e;
      }
    }
    throw storeError('invalid', 'errors.account.unreachable');
  }

  async createAccount(input: NewAccount): Promise<User> {
    checkAccountInput(input);
    const result = await this.invoke({ action: 'create', email: input.email.trim(), name: input.name?.trim() ?? '', password: input.password, role: input.role, must_change_password: input.mustChangePassword ?? true });
    const u = result.user;
    if (!u) throw storeError('invalid', 'errors.account.unreachable');
    return { id: u.id, name: u.name, email: u.email, role: u.role, groupIds: [], locked: false, mustChangePassword: u.must_change_password === true };
  }

  async resetPassword(userId: string, password: string, mustChangePassword = true): Promise<void> {
    checkAccountInput({ password });
    await this.invoke({ action: 'reset_password', user_id: userId, password, must_change_password: mustChangePassword });
  }

  async lock(userId: string): Promise<void> {
    await this.invoke({ action: 'lock', user_id: userId });
  }

  async unlock(userId: string): Promise<void> {
    await this.invoke({ action: 'unlock', user_id: userId });
  }
}

/** The account service of the local store: it changes the snapshot, and the stand-in sign-in when there is one. */
export class LocalAccountAdmin implements AccountAdmin {
  constructor(
    private readonly store: LocalStore,
    private readonly auth: MemoryAuth | null = null,
  ) {}

  private async change(fn: (s: Snapshot, actor: User, newId: () => string) => void): Promise<void> {
    await this.store.changeAccounts(fn);
  }

  async createAccount(input: NewAccount): Promise<User> {
    checkAccountInput(input);
    const email = input.email.trim();
    let created: User | undefined;
    await this.change((s, _actor, newId) => {
      if (s.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw storeError('conflict', 'errors.account.emailTaken', { email });
      created = { id: newId(), name: input.name?.trim() || email.split('@')[0]!, email, role: input.role, groupIds: [], locked: false, mustChangePassword: input.mustChangePassword ?? true };
      s.users.push(created);
    });
    this.auth?.setUser(email, input.password);
    return structuredClone(created!);
  }

  async resetPassword(userId: string, password: string, mustChangePassword = true): Promise<void> {
    checkAccountInput({ password });
    let email = '';
    await this.change((s) => {
      const user = s.users.find((u) => u.id === userId) ?? failMissing();
      user.mustChangePassword = mustChangePassword;
      email = user.email;
    });
    this.auth?.setUser(email, password);
    this.auth?.endSessionOf(email);
  }

  async lock(userId: string): Promise<void> {
    let email = '';
    await this.change((s, actor) => {
      const user = s.users.find((u) => u.id === userId) ?? failMissing();
      if (user.id === actor.id) throw storeError('conflict', 'errors.account.selfLock');
      const others = s.users.filter((u) => u.id !== user.id && u.role === 'admin' && !u.locked);
      if (user.role === 'admin' && !user.locked && others.length === 0) throw storeError('conflict', 'errors.account.lastAdmin');
      user.locked = true;
      email = user.email;
    });
    this.auth?.setLocked(email, true);
    this.auth?.endSessionOf(email);
  }

  async unlock(userId: string): Promise<void> {
    let email = '';
    await this.change((s) => {
      const user = s.users.find((u) => u.id === userId) ?? failMissing();
      user.locked = false;
      email = user.email;
    });
    this.auth?.setLocked(email, false);
  }
}

function failMissing(): never {
  throw storeError('not_found', 'errors.account.userMissing');
}

export const accountText = (id: StoreMessageId, params?: Record<string, string | number>): string => storeText(id, params);
