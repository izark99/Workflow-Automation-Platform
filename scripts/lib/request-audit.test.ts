import { describe, expect, it } from 'vitest';
import { auditRequests, sentinelForms, type LoggedRequest } from './request-audit';

const ORIGIN = 'http://localhost:4176';
const req = (over: Partial<LoggedRequest>): LoggedRequest => ({
  url: `${ORIGIN}/assets/app-abc123.js`,
  method: 'GET',
  postData: null,
  headers: {},
  ...over,
});

describe('auditRequests: what is allowed', () => {
  it('accepts static assets of the app: same origin, GET, no body, no query', () => {
    const log = [
      req({ url: `${ORIGIN}/acceptance/index.html` }),
      req({ url: `${ORIGIN}/assets/duckdb-mvp-9f8e7d.wasm` }),
      req({ url: `${ORIGIN}/assets/duckdb-browser-mvp.worker-1a2b3c.js` }),
      req({ url: `${ORIGIN}/favicon.ico` }),
    ];
    expect(auditRequests(log, ORIGIN, [])).toEqual([]);
  });

  it('accepts local blob and data addresses, which never leave the browser', () => {
    expect(auditRequests([req({ url: 'blob:http://localhost:4176/1d2c' }), req({ url: 'data:text/plain;base64,AAAA' })], ORIGIN, [])).toEqual([]);
  });
});

describe('auditRequests: code from another origin', () => {
  const CODE = 'https://cdn.example/pkg@1.0.0/dist/engine.wasm';

  it('accepts a GET of a listed code address', () => {
    expect(auditRequests([req({ url: CODE })], ORIGIN, [], [CODE])).toEqual([]);
  });

  it('refuses the same address when it is not listed, and any other address on that origin', () => {
    expect(auditRequests([req({ url: CODE })], ORIGIN, [])[0]).toMatch(/another address/);
    expect(auditRequests([req({ url: 'https://cdn.example/collect' })], ORIGIN, [], [CODE])[0]).toMatch(/another address/);
  });

  it('refuses a listed address with another method, a body or file content', () => {
    expect(auditRequests([req({ url: CODE, method: 'POST' })], ORIGIN, [], [CODE])[0]).toMatch(/POST/);
    expect(auditRequests([req({ url: CODE, postData: 'x' })], ORIGIN, [], [CODE])[0]).toMatch(/body/);
    expect(auditRequests([req({ url: CODE, headers: { 'x-a': 'Nguyen Van An' } })], ORIGIN, ['Nguyen Van An'], [CODE])[0]).toMatch(/file content/);
  });
});

describe('auditRequests: what is refused', () => {
  const only = (log: LoggedRequest[], sentinels: string[] = []) => auditRequests(log, ORIGIN, sentinels);

  it('a request to another origin', () => {
    const v = only([req({ url: 'https://example.test/collect' })]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/another address/);
  });

  it('a method other than GET', () => {
    expect(only([req({ method: 'POST' })])[0]).toMatch(/POST/);
    expect(only([req({ method: 'PUT' })])[0]).toMatch(/PUT/);
  });

  it('a request with a body', () => {
    expect(only([req({ postData: 'x=1' })]).some((v) => /body/.test(v))).toBe(true);
  });

  it('a query string, which could carry data, and a path that is not a static asset', () => {
    expect(only([req({ url: `${ORIGIN}/assets/app.js?d=1` })]).some((v) => /query/.test(v))).toBe(true);
    expect(only([req({ url: `${ORIGIN}/leak` })]).some((v) => /not a static asset/.test(v))).toBe(true);
  });

  it('a web socket', () => {
    expect(only([req({ url: 'ws://localhost:4176/socket', method: 'WEBSOCKET' })]).some((v) => /web socket/i.test(v))).toBe(true);
  });

  it('a request that carries file content, in any of its forms', () => {
    const secret = 'PRIVATE-Nguyen Van An';
    for (const form of sentinelForms(secret)) {
      expect(only([req({ url: `${ORIGIN}/assets/app.js#${form}` })], [secret]).some((v) => /file content/.test(v)), form).toBe(true);
      expect(only([req({ headers: { 'x-extra': form } })], [secret]).some((v) => /file content/.test(v)), form).toBe(true);
      expect(only([req({ method: 'POST', postData: `d=${form}` })], [secret]).some((v) => /file content/.test(v)), form).toBe(true);
    }
  });

  it('reports every violation of every request', () => {
    const v = only([req({ url: 'https://example.test/x?d=1', method: 'POST', postData: 'a' }), req({ url: `${ORIGIN}/leak` })]);
    expect(v.length).toBeGreaterThanOrEqual(4);
  });
});

describe('sentinelForms', () => {
  it('gives the plain text, the url-encoded text and the base64 of the text', () => {
    const forms = sentinelForms('a b/ü');
    expect(forms).toContain('a b/ü');
    expect(forms).toContain(encodeURIComponent('a b/ü'));
    expect(forms).toContain(Buffer.from('a b/ü', 'utf8').toString('base64'));
  });
});
