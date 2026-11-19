// The Edge Function `admin-users` (SPEC 11.1, decision D76): the only server code of the app.
// Actions: create, reset_password, lock, unlock. It uses the service role, so it checks the caller itself:
// a valid token of an ACTIVE ADMIN, and nothing else is accepted. Every answer is JSON. An error is
//   { error: { code, messageId, params, message } }
// where `messageId` is a key of the message catalog of the app (the UI shows its own text) and `message` is the English text.
// It has no dependency: it talks to Auth and to the REST API with fetch, so the Edge Runtime needs no package download.

const MIN_PASSWORD = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAN_FOREVER = '876000h'; // about 100 years
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Keep this table equal to the `errors.account.*` entries of src/store/messages.ts (a unit test compares them).
const MESSAGES = {
  'errors.account.signedOut': 'You are not signed in. Sign in and try again.',
  'errors.account.notAdmin': 'Only an active admin can manage accounts. Ask the admin.',
  'errors.account.badRequest': 'The request is not understood. Reload the page and try again.',
  'errors.account.emailInvalid': '"{email}" is not an email address. Type an address like name@company.com.',
  'errors.account.passwordShort': 'The password needs at least {min} characters. Type a longer password.',
  'errors.account.roleInvalid': 'The role must be user or admin. Choose one of them.',
  'errors.account.emailTaken': 'An account with the email {email} exists. Use another email address.',
  'errors.account.userMissing': 'This user does not exist any more. Reload the page.',
  'errors.account.selfLock': 'You cannot lock your own account. Ask another admin.',
  'errors.account.lastAdmin': 'At least one active admin is needed. Make another user an admin first, then change this user.',
  'errors.account.failed': 'The account could not be changed: {detail}. Try again.',
} as const;
type MessageId = keyof typeof MESSAGES;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function fail(status: number, code: string, id: MessageId, params: Record<string, string | number> = {}): Response {
  const message = MESSAGES[id].replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
  return json(status, { error: { code, messageId: id, params, message } });
}

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface Reply {
  status: number;
  /** The JSON of the answer, read field by field below. */
  data: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** One call to Auth or to the REST API with the service role. A body that is not JSON comes back as null. */
async function call(method: string, path: string, body?: unknown, token?: string): Promise<Reply> {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: serviceKey, Authorization: `Bearer ${token ?? serviceKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  try {
    return { status: response.status, data: raw ? JSON.parse(raw) : null };
  } catch {
    return { status: response.status, data: null };
  }
}

const ok = (r: Reply): boolean => r.status >= 200 && r.status < 300;
const detailOf = (r: Reply): string => String(r.data?.message ?? r.data?.msg ?? r.data?.error_description ?? `HTTP ${r.status}`);
const rpc = (name: string, args: Record<string, unknown>): Promise<Reply> => call('POST', `/rest/v1/rpc/${name}`, args);
const profileRow = async (id: string): Promise<{ id: string; role: string; locked_at: string | null; name?: string; email?: string } | null> => {
  const r = await call('GET', `/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,name,email,role,locked_at`);
  return ok(r) && Array.isArray(r.data) && r.data.length === 1 ? r.data[0] : null;
};

interface Caller {
  id: string;
}

/** The signed-in active admin that sent the token, or the response that refuses the call. */
async function callerOf(request: Request): Promise<Caller | Response> {
  const header = request.headers.get('Authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  if (!token) return fail(401, 'unauthenticated', 'errors.account.signedOut');
  const who = await call('GET', '/auth/v1/user', undefined, token);
  const id = ok(who) && typeof who.data?.id === 'string' ? who.data.id : null;
  if (!id) return fail(401, 'unauthenticated', 'errors.account.signedOut');
  const profile = await profileRow(id);
  if (!profile || profile.role !== 'admin' || profile.locked_at !== null) return fail(403, 'forbidden', 'errors.account.notAdmin');
  return { id };
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const userExists = async (id: string): Promise<boolean> => (await profileRow(id)) !== null;

async function create(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const email = text(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role === undefined ? 'user' : body.role;
  const name = text(body.name);
  if (!EMAIL.test(email)) return fail(400, 'invalid', 'errors.account.emailInvalid', { email });
  if (password.length < MIN_PASSWORD) return fail(400, 'invalid', 'errors.account.passwordShort', { min: MIN_PASSWORD });
  if (role !== 'user' && role !== 'admin') return fail(400, 'invalid', 'errors.account.roleInvalid');
  const mustChange = body.must_change_password !== false;

  const created = await call('POST', '/auth/v1/admin/users', { email, password, email_confirm: true, user_metadata: name ? { name } : {} });
  if (!ok(created) || typeof created.data?.id !== 'string') {
    const code = created.data?.error_code ?? created.data?.code;
    if (code === 'email_exists' || code === 'user_already_exists') return fail(409, 'conflict', 'errors.account.emailTaken', { email });
    return fail(500, 'failed', 'errors.account.failed', { detail: detailOf(created) });
  }
  const id: string = created.data.id;
  // The profile is made by the trigger of Auth (always role user). The role and the flag are set here, with the service role.
  if (!(await userExists(id))) {
    await call('DELETE', `/auth/v1/admin/users/${id}`);
    return fail(409, 'conflict', 'errors.account.emailTaken', { email });
  }
  if (role === 'admin') {
    const set = await call('PATCH', `/rest/v1/profiles?id=eq.${id}`, { role: 'admin' });
    if (!ok(set)) return fail(500, 'failed', 'errors.account.failed', { detail: detailOf(set) });
  }
  const flag = await rpc('admin_set_must_change_password', { p_actor: caller.id, p_user: id, p_value: mustChange });
  if (!ok(flag)) return fail(500, 'failed', 'errors.account.failed', { detail: detailOf(flag) });
  const profile = await profileRow(id);
  return json(200, { user: { id, name: profile?.name ?? name, email, role, locked: false, must_change_password: mustChange } });
}

async function resetPassword(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const id = text(body.user_id);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!UUID.test(id)) return fail(400, 'invalid', 'errors.account.badRequest');
  if (password.length < MIN_PASSWORD) return fail(400, 'invalid', 'errors.account.passwordShort', { min: MIN_PASSWORD });
  if (!(await userExists(id))) return fail(404, 'not_found', 'errors.account.userMissing');
  const updated = await call('PUT', `/auth/v1/admin/users/${id}`, { password });
  if (!ok(updated)) return fail(500, 'failed', 'errors.account.failed', { detail: detailOf(updated) });
  const flag = await rpc('admin_set_must_change_password', { p_actor: caller.id, p_user: id, p_value: body.must_change_password !== false });
  if (!ok(flag)) return fail(500, 'failed', 'errors.account.failed', { detail: detailOf(flag) });
  await rpc('admin_end_sessions', { p_user: id });
  return json(200, { ok: true });
}

async function lock(caller: Caller, body: Record<string, unknown>, locked: boolean): Promise<Response> {
  const id = text(body.user_id);
  if (!UUID.test(id)) return fail(400, 'invalid', 'errors.account.badRequest');
  if (locked && id === caller.id) return fail(409, 'conflict', 'errors.account.selfLock');
  // The database applies the rules (an active admin acts, not on oneself, the last active admin stays).
  const set = await rpc('admin_set_locked', { p_actor: caller.id, p_user: id, p_locked: locked });
  if (!ok(set)) {
    const code = set.data?.code;
    if (code === 'P0002') return fail(404, 'not_found', 'errors.account.userMissing');
    if (code === 'P0001') return fail(409, 'conflict', 'errors.account.lastAdmin');
    if (code === '22023') return fail(409, 'conflict', 'errors.account.selfLock');
    if (code === '42501') return fail(403, 'forbidden', 'errors.account.notAdmin');
    return fail(500, 'failed', 'errors.account.failed', { detail: detailOf(set) });
  }
  // Auth: a ban stops new sign-ins and refreshes; the sessions are ended too.
  const ban = await call('PUT', `/auth/v1/admin/users/${id}`, { ban_duration: locked ? BAN_FOREVER : 'none' });
  if (!ok(ban)) {
    await rpc('admin_set_locked', { p_actor: caller.id, p_user: id, p_locked: !locked }); // undo, so the two stay equal
    return fail(500, 'failed', 'errors.account.failed', { detail: detailOf(ban) });
  }
  if (locked) await rpc('admin_end_sessions', { p_user: id });
  return json(200, { ok: true });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return fail(400, 'invalid', 'errors.account.badRequest');
  const caller = await callerOf(request);
  if (caller instanceof Response) return caller;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, 'invalid', 'errors.account.badRequest');
  }
  try {
    switch (body.action) {
      case 'create':
        return await create(caller, body);
      case 'reset_password':
        return await resetPassword(caller, body);
      case 'lock':
        return await lock(caller, body, true);
      case 'unlock':
        return await lock(caller, body, false);
      default:
        return fail(400, 'invalid', 'errors.account.badRequest');
    }
  } catch (e) {
    return fail(500, 'failed', 'errors.account.failed', { detail: e instanceof Error ? e.message : String(e) });
  }
});
