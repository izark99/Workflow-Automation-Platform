import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// docs/DEPLOY.md is for a human. These tests keep it true: everything it names must exist, and the safety warnings stay.
const doc = existsSync('docs/DEPLOY.md') ? readFileSync('docs/DEPLOY.md', 'utf8') : '';
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

describe('docs/DEPLOY.md', () => {
  it('exists and has the steps in order', () => {
    expect(doc.length).toBeGreaterThan(1000);
    const headings = [...doc.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);
    const order = ['Before you start', 'Create the Supabase project', 'Apply the migrations', 'Close sign-ups', 'Create the first admin', 'Deploy the app on Cloudflare Pages', 'Keep the project awake', 'Check it works', 'Limits'];
    expect(headings.filter((h) => order.includes(h))).toEqual(order);
  });

  it('names only npm scripts and files that exist', () => {
    for (const m of doc.matchAll(/npm run ([a-z:]+)/g)) expect(pkg.scripts, `npm run ${m[1]}`).toHaveProperty(m[1]!);
    for (const m of doc.matchAll(/`((?:docs|scripts|supabase|\.github)\/[A-Za-z0-9_./-]+)`/g)) expect(existsSync(m[1]!), m[1]).toBe(true);
  });

  it('names the variables the app and the keep-alive read, and the build settings', () => {
    for (const v of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY']) expect(doc).toContain(v);
    expect(doc).toContain('npm run build');
    expect(doc).toMatch(/Build output directory[^\n]*`dist`/);
  });

  it('warns about the service key and about open sign-ups', () => {
    expect(doc).toMatch(/service_role[^\n]*never/i);
    expect(doc).toMatch(/Do not put the service key[^\n]*Cloudflare/i);
    expect(doc).toMatch(/turn off sign-ups|Allow new users to sign up/i);
  });

  it('gives the first-admin statement that the database test runs', () => {
    const line = (text: string) => text.split('\n').find((l) => l.trim().startsWith("update public.profiles set role = 'admin'"))?.trim();
    const documented = line(doc);
    expect(documented).toBeTruthy();
    expect(line(readFileSync('supabase/tests/database/100-first-admin.test.sql', 'utf8'))).toBe(documented);
  });

  it('states the known blocker of the Pages upload: two DuckDB-WASM files above 25 MiB', () => {
    expect(doc).toMatch(/Known blocker/);
    expect(doc).toMatch(/25 MiB/);
    expect(doc).toContain('duckdb-mvp');
    expect(doc).toContain('duckdb-eh');
    expect(doc).toMatch(/R2/);
  });

  it('states what the build does not do', () => {
    expect(doc).toMatch(/nothing here was deployed/i);
  });
});
