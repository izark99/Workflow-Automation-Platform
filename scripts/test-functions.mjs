// Gate G6: the Edge Function `admin-users` on a local Supabase with the Edge Runtime (docker is started if it is not running).
// Starts the full stack, applies the migrations from zero, waits until the function answers, then runs the integration test.
// Set DB_KEEP_RUNNING=1 to leave the stack up after the run.
import { ensureDocker, run, sleep, supabase, withRetry } from './lib/local-supabase.mjs';

const parseEnv = (text) =>
  Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );

/** The first answer of the function (any HTTP status) means the Edge Runtime has loaded it. */
async function waitForFunction(apiUrl, anonKey) {
  const target = `${apiUrl}/functions/v1/admin-users`;
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(target, { method: 'POST', headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey, 'Content-Type': 'application/json' }, body: '{}' });
      if (response.status !== 404 && response.status < 500) return;
    } catch {
      // not up yet
    }
    await sleep(2000);
  }
  throw new Error('The admin-users function did not answer within 2 minutes. Run npx supabase functions serve admin-users and read its log.');
}

async function main() {
  await ensureDocker();

  const started = await withRetry('supabase start', () => supabase(['start']));
  if (started.status !== 0) {
    console.error('The local stack did not start. If the output above names a host that cannot be reached (the Edge Runtime image), write that host under Blockers in PROGRESS.md.');
    return started.status;
  }
  const reset = supabase(['db', 'reset']);
  if (reset.status !== 0) return reset.status;

  const env = parseEnv(supabase(['status', '-o', 'env'], { quiet: true }).stdout);
  for (const key of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) {
    if (!env[key]) throw new Error(`supabase status did not print ${key}. Run npx supabase status and check that all services are up.`);
  }
  await waitForFunction(env.API_URL, env.ANON_KEY);

  return run('npx', ['vitest', 'run', '-c', 'vitest.functions.config.ts'], {
    env: { ...process.env, FUNCTIONS_API_URL: env.API_URL, FUNCTIONS_ANON_KEY: env.ANON_KEY, FUNCTIONS_SERVICE_KEY: env.SERVICE_ROLE_KEY },
  }).status;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  if (process.env.DB_KEEP_RUNNING !== '1') supabase(['stop', '--no-backup']);
}
console.log(`test:functions exit ${code}`);
process.exit(code);
