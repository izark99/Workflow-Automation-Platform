import { describe, expect, it, vi } from 'vitest';
import { keepAlive } from './keep-alive';

const ANON = 'anon-key-value';
const SERVICE = 'service-key-value';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const noWait = () => Promise.resolve();

function setup(responses: (Response | Error)[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const queue = [...responses];
  const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: init?.headers as Record<string, string> });
    const next = queue.shift() ?? new Error('no more responses');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const logs: string[] = [];
  return { calls, fetch: fetch as unknown as typeof globalThis.fetch, logs, log: (m: string) => logs.push(m) };
}

describe('keepAlive', () => {
  it('names the missing variable and what to do', async () => {
    const s = setup([]);
    await expect(keepAlive({ SUPABASE_ANON_KEY: ANON }, { fetch: s.fetch, log: s.log, sleep: noWait })).rejects.toThrowError(
      'SUPABASE_URL is missing. Set SUPABASE_URL and SUPABASE_ANON_KEY (see docs/KEEP_ALIVE.md).',
    );
    await expect(keepAlive({ SUPABASE_URL: 'http://x' }, { fetch: s.fetch, log: s.log, sleep: noWait })).rejects.toThrowError('SUPABASE_ANON_KEY is missing.');
    expect(s.calls).toHaveLength(0);
  });

  it('calls keep_alive with the anon key and reports the time', async () => {
    const s = setup([json('2026-11-18T03:17:00+00:00')]);
    const result = await keepAlive({ SUPABASE_URL: 'https://p.example.test/', SUPABASE_ANON_KEY: ANON }, { fetch: s.fetch, log: s.log, sleep: noWait });
    expect(result).toEqual({ touchedAt: '2026-11-18T03:17:00+00:00', removedFlows: null });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.url).toBe('https://p.example.test/rest/v1/rpc/keep_alive');
    expect(s.calls[0]!.headers).toMatchObject({ apikey: ANON, authorization: `Bearer ${ANON}` });
    expect(s.logs.join('\n')).toContain('2026-11-18T03:17:00+00:00');
  });

  it('also removes expired deleted flows when a service key is given', async () => {
    const s = setup([json('2026-11-18T03:17:00+00:00'), json(3)]);
    const result = await keepAlive(
      { SUPABASE_URL: 'https://p.example.test', SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_KEY: SERVICE },
      { fetch: s.fetch, log: s.log, sleep: noWait },
    );
    expect(result.removedFlows).toBe(3);
    expect(s.calls[1]!.url).toBe('https://p.example.test/rest/v1/rpc/purge_expired_flows');
    expect(s.calls[1]!.headers).toMatchObject({ apikey: SERVICE, authorization: `Bearer ${SERVICE}` });
    expect(s.logs.join('\n')).toContain('3 deleted flow');
  });

  it('retries a server error and a lost connection, then succeeds', async () => {
    const s = setup([new Response('down', { status: 503 }), new TypeError('fetch failed'), json('2026-11-18T03:17:00+00:00')]);
    const result = await keepAlive({ SUPABASE_URL: 'https://p.example.test', SUPABASE_ANON_KEY: ANON }, { fetch: s.fetch, log: s.log, sleep: noWait });
    expect(result.touchedAt).toBe('2026-11-18T03:17:00+00:00');
    expect(s.calls).toHaveLength(3);
  });

  it('gives up after three tries with the status and what to check', async () => {
    const s = setup([new Response('x', { status: 500 }), new Response('x', { status: 500 }), new Response('x', { status: 502 })]);
    await expect(keepAlive({ SUPABASE_URL: 'https://p.example.test', SUPABASE_ANON_KEY: ANON }, { fetch: s.fetch, log: s.log, sleep: noWait })).rejects.toThrowError(
      /keep_alive failed after 3 tries \(HTTP 502\)\. Check that the project is not paused/,
    );
    expect(s.calls).toHaveLength(3);
  });

  it('does not retry a refused request (a wrong key or a missing function)', async () => {
    const s = setup([new Response('no', { status: 401 })]);
    await expect(keepAlive({ SUPABASE_URL: 'https://p.example.test', SUPABASE_ANON_KEY: ANON }, { fetch: s.fetch, log: s.log, sleep: noWait })).rejects.toThrowError(
      /keep_alive was refused \(HTTP 401\)\. Check SUPABASE_ANON_KEY and that the migrations are applied/,
    );
    expect(s.calls).toHaveLength(1);
  });

  it('never writes a key to the log or into an error', async () => {
    const s = setup([json('2026-11-18T03:17:00+00:00'), new Response('no', { status: 401 })]);
    const error = await keepAlive(
      { SUPABASE_URL: 'https://p.example.test', SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_KEY: SERVICE },
      { fetch: s.fetch, log: s.log, sleep: noWait },
    ).catch((e: Error) => e);
    const text = `${s.logs.join('\n')}\n${(error as Error).message}`;
    expect(text).not.toContain(ANON);
    expect(text).not.toContain(SERVICE);
  });
});
