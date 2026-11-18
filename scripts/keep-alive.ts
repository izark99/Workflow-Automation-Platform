// The daily keep-alive (T3.8, decision D69). A free Supabase project pauses after a week without requests, so a
// scheduled job calls this once a day: it asks the database for the time through the small function `keep_alive()`,
// and, when a service key is given, also removes the flows that were deleted 30 days ago or more (D60).
// Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... [SUPABASE_SERVICE_KEY=...] node scripts/keep-alive.ts
// The keys are never printed.

export interface KeepAliveEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_KEY?: string;
}

export interface KeepAliveDeps {
  fetch: typeof globalThis.fetch;
  log: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

const TRIES = 3;

async function rpc(name: string, key: string, base: string, deps: KeepAliveDeps): Promise<unknown> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let status = 0;
  for (let attempt = 1; attempt <= TRIES; attempt += 1) {
    try {
      const response = await deps.fetch(`${base}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: '{}',
      });
      status = response.status;
      if (response.ok) return await response.json();
      if (status < 500) {
        throw new Error(`${name} was refused (HTTP ${status}). Check SUPABASE_ANON_KEY and that the migrations are applied (docs/KEEP_ALIVE.md).`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('was refused')) throw e;
      status = 0; // a lost connection counts as a try, like a server error
    }
    if (attempt < TRIES) await sleep(2000 * attempt);
  }
  throw new Error(`${name} failed after ${TRIES} tries (HTTP ${status || 'no answer'}). Check that the project is not paused and that SUPABASE_URL is right (docs/KEEP_ALIVE.md).`);
}

export async function keepAlive(env: KeepAliveEnv, deps: KeepAliveDeps): Promise<{ touchedAt: string; removedFlows: number | null }> {
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const anon = env.SUPABASE_ANON_KEY?.trim();
  if (!url) throw new Error('SUPABASE_URL is missing. Set SUPABASE_URL and SUPABASE_ANON_KEY (see docs/KEEP_ALIVE.md).');
  if (!anon) throw new Error('SUPABASE_ANON_KEY is missing. Set SUPABASE_URL and SUPABASE_ANON_KEY (see docs/KEEP_ALIVE.md).');

  const touchedAt = String(await rpc('keep_alive', anon, url, deps));
  deps.log(`Database answered at ${touchedAt}.`);

  const service = env.SUPABASE_SERVICE_KEY?.trim();
  if (!service) return { touchedAt, removedFlows: null };
  const removed = Number(await rpc('purge_expired_flows', service, url, deps));
  deps.log(`Removed ${removed} deleted flow(s) that were kept 30 days or more.`);
  return { touchedAt, removedFlows: removed };
}

// Run from the command line (not when a test imports this file).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  keepAlive(process.env, { fetch: globalThis.fetch, log: (m) => console.log(m) }).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
