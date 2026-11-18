// The keep-alive script against the real local stack. Run it with `npm run test:store`.
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { keepAlive } from '../scripts/keep-alive';

const URL = process.env.STORE_API_URL ?? '';
const ANON = process.env.STORE_ANON_KEY ?? '';
const SERVICE = process.env.STORE_SERVICE_KEY ?? '';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const deps = (logs: string[]) => ({ fetch: globalThis.fetch, log: (m: string) => logs.push(m), sleep: () => Promise.resolve() });

describe('keep-alive', () => {
  it('touches the database with the anon key', async () => {
    expect(URL && ANON && SERVICE, 'run this test with npm run test:store').toBeTruthy();
    const logs: string[] = [];
    const result = await keepAlive({ SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON }, deps(logs));
    expect(Math.abs(Date.parse(result.touchedAt) - Date.now())).toBeLessThan(60_000);
    expect(result.removedFlows).toBeNull();
    expect(logs.join('\n')).not.toContain(ANON);
  });

  it('removes the flows deleted 30 days ago or more when it has the service key, and keeps the others', async () => {
    const service = createClient(URL, SERVICE, options);
    const owner = await service.auth.admin.createUser({ email: 'keep.alive.owner@example.test', password: 'integration-test-password-3', email_confirm: true });
    const ownerId = owner.data.user!.id;
    const day = 86_400_000;
    const rows = [
      { name: 'Keep-alive old', deleted_at: new Date(Date.now() - 31 * day).toISOString() },
      { name: 'Keep-alive recent', deleted_at: new Date(Date.now() - 5 * day).toISOString() },
    ].map((r) => ({ ...r, owner_id: ownerId, scope: 'personal' }));
    const inserted = await service.from('flows').insert(rows).select('id, name');
    expect(inserted.data).toHaveLength(2);

    const result = await keepAlive({ SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_KEY: SERVICE }, deps([]));
    expect(result.removedFlows).toBeGreaterThanOrEqual(1);
    const left = await service.from('flows').select('name').in('name', ['Keep-alive old', 'Keep-alive recent']);
    expect(left.data?.map((r) => r.name)).toEqual(['Keep-alive recent']);
  });

  it('is refused with a clear message for a wrong key', async () => {
    await expect(keepAlive({ SUPABASE_URL: URL, SUPABASE_ANON_KEY: 'not-a-key' }, deps([]))).rejects.toThrowError(/was refused \(HTTP 401\)/);
  });
});
