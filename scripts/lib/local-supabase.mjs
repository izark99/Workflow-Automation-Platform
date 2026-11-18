// Helpers shared by the runners of the local Supabase stack (npm run test:db, npm run test:store).
import { spawn, spawnSync } from 'node:child_process';

const START_ATTEMPTS = 4;
const PULL_ERROR = /data limit exceeded|too many requests|\b429\b|pull access|failed to pull|i\/o timeout|tls handshake|unexpected eof|connection reset/i;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (!options.quiet) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`, stdout: result.stdout ?? '' };
}

export const supabase = (args, options) => run('npx', ['--no-install', 'supabase', ...args], options);

export async function ensureDocker() {
  if (run('docker', ['info'], { quiet: true }).status === 0) return;
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

// Retry a step that downloads images. Only a download problem is retried: a real failure (a migration error,
// a failing test) must stop at once.
export async function withRetry(label, step) {
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
