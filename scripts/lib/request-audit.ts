// Audit of the network requests of a page during a run: only static assets of the app may be loaded, and no request may
// carry file content. Used by the acceptance tests (CLAUDE.md: input file content never leaves the browser).

export interface LoggedRequest {
  url: string;
  /** `WEBSOCKET` for a web socket connection. */
  method: string;
  postData: string | null;
  headers: Record<string, string>;
}

/** The forms in which a piece of file content could travel: plain, url-encoded and base64. */
export function sentinelForms(text: string): string[] {
  return [...new Set([text, encodeURIComponent(text), Buffer.from(text, 'utf8').toString('base64')])];
}

/** Paths that are static assets of the built page. Everything else is a request that carries something. */
const STATIC_PATH = /^\/(acceptance\/index\.html|assets\/[^/]+|favicon\.ico)$/;

/**
 * Returns one message per violation, an empty list when the log is clean. `sentinels` are pieces of file content that
 * must not appear anywhere in any request (address, headers, body).
 */
export function auditRequests(log: LoggedRequest[], origin: string, sentinels: string[]): string[] {
  const violations: string[] = [];
  const forms = sentinels.flatMap((s) => sentinelForms(s).map((form) => ({ sentinel: s, form })));
  for (const r of log) {
    const label = `${r.method} ${r.url.length > 120 ? `${r.url.slice(0, 120)}...` : r.url}`;
    if (r.url.startsWith('blob:') || r.url.startsWith('data:')) {
      // Local addresses. They still must not carry a sentinel (checked below).
    } else if (r.method === 'WEBSOCKET') {
      violations.push(`${label}: a web socket connection is not a static asset.`);
    } else {
      const url = new URL(r.url);
      if (url.origin !== origin) violations.push(`${label}: a request to another address (${url.origin}).`);
      else if (!STATIC_PATH.test(url.pathname)) violations.push(`${label}: ${url.pathname} is not a static asset of the app.`);
      if (url.search !== '' || url.hash !== '') violations.push(`${label}: a static asset is requested with a query or fragment, which could carry data.`);
      if (r.method !== 'GET') violations.push(`${label}: ${r.method} is not a request for a static asset (only GET is).`);
    }
    if (r.postData) violations.push(`${label}: the request has a body.`);
    const haystack = [r.url, r.postData ?? '', ...Object.values(r.headers)].join('\n');
    for (const { sentinel, form } of forms) {
      if (haystack.includes(form)) {
        violations.push(`${label}: the request carries file content (${JSON.stringify(sentinel)}).`);
        break;
      }
    }
  }
  return violations;
}
