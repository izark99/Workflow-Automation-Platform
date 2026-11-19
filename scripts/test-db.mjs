// Gate G5 runner: local Supabase, migrations from zero, pgTAP tests.
//
// Only the database container is started. The tests need the `auth` schema
// (`auth.users`, `auth.uid()`), which ships in the database image, and they
// act as a user through `set local role` and `request.jwt.claims`, so the
// API, Auth and gateway containers are left out (fewer images to pull).
//
// Set DB_KEEP_RUNNING=1 to leave the database up after the run.
import { ensureDocker, supabase, withRetry } from './lib/local-supabase.mjs';

const SKIPPED_SERVICES = 'gotrue,postgrest,kong,edge-runtime';

async function main() {
  await ensureDocker();

  const started = await withRetry('supabase start', () => supabase(['start', '-x', SKIPPED_SERVICES]));
  if (started.status !== 0) return started.status;

  const reset = supabase(['db', 'reset']);
  if (reset.status !== 0) {
    console.error('Migrations did not apply from zero. Fix the first error above, then run npm run test:db again.');
    return reset.status;
  }

  const tested = await withRetry('supabase test db', () => supabase(['test', 'db']));
  if (tested.status !== 0) console.error('Database tests failed. See the failing test above.');
  return tested.status;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  if (process.env.DB_KEEP_RUNNING !== '1') supabase(['stop', '--no-backup']);
}
console.log(`test:db exit ${code}`);
process.exit(code);
