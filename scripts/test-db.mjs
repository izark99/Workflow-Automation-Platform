// Gate G5 runner: local Supabase, migrations from zero, pgTAP tests.
//
// Only the database container is started. The tests need the `auth` schema
// (`auth.users`, `auth.uid()`), which ships in the database image, and they
// act as a user through `set local role` and `request.jwt.claims`, so the
// API, Auth and gateway containers are left out (fewer images to pull).
//
// Set DB_KEEP_RUNNING=1 to leave the database up after the run.
import { spawn, spawnSync } from 'node:child_process';

const SKIPPED_SERVICES = 'gotrue,postgrest,kong';
const START_ATTEMPTS = 4;
const PULL_ERROR = /data limit exceeded|too many requests|\b429\b|pull access|failed to pull|i\/o timeout|tls handshake|unexpected eof|connection reset/i;

const supabase = (args) => run('npx', ['--no-install', 'supabase', ...args]);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureDocker() {
  if (run('docker', ['info']).status === 0) return;
  console.log('Docker is not running. Starting the daemon.');
  const daemon = spawn('dockerd', [], { detached: true, stdio: 'ignore' });
  daemon.on('error', () => {});
  daemon.unref();
  for (let i = 0; i < 30; i += 1) {
    await sleep(2000);
    if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0) return;
  }
  throw new Error('Docker did not start within 60 seconds. Start the Docker daemon and run the command again.');
}

// Retry a step that downloads images. Only a download problem is retried:
// a real failure (a migration error, a failing test) must stop at once.
async function withRetry(label, step) {
  let last;
  for (let attempt = 1; attempt <= START_ATTEMPTS; attempt += 1) {
    last = step();
    if (last.status === 0) return last;
    if (!PULL_ERROR.test(last.output)) return last;
    console.warn(`${label}: image download failed (attempt ${attempt} of ${START_ATTEMPTS}).`);
    if (attempt < START_ATTEMPTS) await sleep(15000 * attempt);
  }
  return last;
}

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
