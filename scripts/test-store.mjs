// Integration test of SupabaseStore on the full local stack: database, Auth, REST API and gateway.
// Not part of `npm run gates` (gate G5 is `npm run test:db`); run it after a change to src/store/supabase-*.
// Set DB_KEEP_RUNNING=1 to leave the stack up after the run.
import { ensureDocker, run, supabase, withRetry } from './lib/local-supabase.mjs';

async function main() {
  await ensureDocker();

  const started = await withRetry('supabase start', () => supabase(['start']));
  if (started.status !== 0) return started.status;

  const reset = supabase(['db', 'reset']);
  if (reset.status !== 0) return reset.status;

  const status = supabase(['status', '-o', 'env'], { quiet: true });
  const env = Object.fromEntries(
    status.stdout
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  for (const key of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) {
    if (!env[key]) throw new Error(`supabase status did not print ${key}. Run npx supabase status and check that all services are up.`);
  }

  return run('npx', ['vitest', 'run', '-c', 'vitest.store.config.ts'], {
    env: { ...process.env, STORE_API_URL: env.API_URL, STORE_ANON_KEY: env.ANON_KEY, STORE_SERVICE_KEY: env.SERVICE_ROLE_KEY },
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
console.log(`test:store exit ${code}`);
process.exit(code);
