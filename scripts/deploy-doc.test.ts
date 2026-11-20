import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// docs/DEPLOY.md is for a human. These tests keep it true: everything it names must exist, and the safety warnings stay.
const doc = existsSync('docs/DEPLOY.md') ? readFileSync('docs/DEPLOY.md', 'utf8') : '';
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

describe('docs/DEPLOY.md', () => {
  it('exists and has the steps in order', () => {
    expect(doc.length).toBeGreaterThan(1000);
    const headings = [...doc.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);
    const order = ['Before you start', 'Create the Supabase project', 'Apply the migrations', 'Deploy the account function', 'Close sign-ups', 'Create the first admin', 'Deploy the app on Cloudflare Pages', 'Keep the project awake', 'Check it works', 'Upgrade an existing deployment', 'Upgrade from Phase 4', 'Upgrade from Phase 5', 'Limits'];
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

  it('uses the Pages build, which keeps every file under 25 MiB, and names the CDN host', () => {
    expect(doc).toMatch(/Build command: `npm run build:pages`/);
    expect(pkg.scripts['build:pages']).toContain('check-dist-size');
    expect(doc).toMatch(/25 MiB/);
    expect(doc).toContain('cdn.jsdelivr.net');
    expect(doc).toMatch(/ask IT to allow/i);
  });

  it('has an upgrade section that applies the new migrations and deploys the function, in order', () => {
    const section = doc.slice(doc.indexOf('## Upgrade an existing deployment'), doc.indexOf('## Upgrade from Phase 4'));
    expect(section.length).toBeGreaterThan(500);
    const at = (text: string) => section.indexOf(text);
    const order = ['Back up first', 'npx supabase db push', 'npx supabase functions deploy admin-users', 'Deploy the app', 'Check it'];
    for (const o of order) expect(at(o), o).toBeGreaterThan(-1);
    expect(order.map(at)).toEqual([...order.map(at)].sort((a, b) => a - b));
    // Every migration that Phase 4 added is named, and each one exists.
    for (const m of ['20261118000010_ui_texts.sql', '20261118000011_account_lock.sql', '20261118000012_end_sessions.sql', '20261118000013_ui_text_stamp_revoke.sql']) {
      expect(section, m).toContain(m);
      expect(existsSync(`supabase/migrations/${m}`), m).toBe(true);
    }
    for (const word of ['Accounts', 'Themes', 'Texts', 'Parameters']) expect(section).toContain(word);
  });

  it('has a Phase 5 upgrade section that backs up, applies migrations 14 to 17, deploys no function and checks the features', () => {
    const section = doc.slice(doc.indexOf('## Upgrade from Phase 4'), doc.indexOf('## Upgrade from Phase 5'));
    expect(section.length).toBeGreaterThan(500);
    const at = (text: string) => section.indexOf(text);
    const order = ['Back up first', 'npx supabase db push', 'There is no new function', 'Deploy the app', 'Check it'];
    for (const o of order) expect(at(o), o).toBeGreaterThan(-1);
    expect(order.map(at)).toEqual([...order.map(at)].sort((a, b) => a - b));
    expect(section).not.toContain('functions deploy');
    for (const m of ['20261118000014_save_ui_texts.sql', '20261118000015_app_settings.sql', '20261118000016_flow_ref_tables.sql', '20261118000017_ref_table_visibility.sql']) {
      expect(section, m).toContain(m);
      expect(existsSync(`supabase/migrations/${m}`), m).toBe(true);
    }
    for (const word of ['Import', 'Who sees what', 'Sign-out', 'Texts', 'Panels']) expect(section).toContain(word);
  });

  it('has a Phase 6 upgrade section that backs up, applies migration 18, deploys no function, checks the features and warns about a rollback', () => {
    const section = doc.slice(doc.indexOf('## Upgrade from Phase 5'), doc.indexOf('## Limits'));
    expect(section.length).toBeGreaterThan(500);
    const at = (text: string) => section.indexOf(text);
    const order = ['Back up first', 'npx supabase db push', 'There is no new function', 'Deploy the app', 'Check it', 'If something is wrong'];
    for (const o of order) expect(at(o), o).toBeGreaterThan(-1);
    expect(order.map(at)).toEqual([...order.map(at)].sort((a, b) => a - b));
    expect(section).not.toContain('functions deploy');
    // The one new migration is named, exists, and is the only file that the push lists.
    const m = '20261118000018_ref_table_names_reference_step.sql';
    expect(section).toContain(m);
    expect(existsSync(`supabase/migrations/${m}`)).toBe(true);
    expect(section).not.toMatch(/2026111800001[0-7]_/);
    for (const word of ['Reference table step', 'Date check', 'Parameters in input boxes', 'Analyze file', 'Dragging']) expect(section).toContain(word);
    // A rollback would strand flows that use the new step or a parameter in an input box.
    expect(section).toMatch(/cannot run a flow that has a Reference table step/);
    expect(section).toMatch(/version 3/);
  });

  it('states the limits of Phase 6: a sample file is never stored, the analysis is a proposal, and csv cells with a line break', () => {
    const limits = doc.slice(doc.indexOf('## Limits'));
    expect(limits).toMatch(/never uploaded or stored/);
    expect(limits).toMatch(/The analysis is a proposal/);
    expect(limits).toMatch(/line break inside quotes/);
  });

  it('states the limits of Phase 5: the sign-out check is in the browser and the token lives up to one hour, and which tables a user reads', () => {
    const limits = doc.slice(doc.indexOf('## Limits'));
    expect(limits).toMatch(/Sign-out after inactivity is checked in the browser/);
    expect(limits).toMatch(/up to one hour later/);
    expect(limits).toMatch(/reads the rows of a reference table only when a live flow/);
  });

  it('deploys the function that exists, with the JWT check on, and does not hand out the service key', () => {
    expect(existsSync('supabase/functions/admin-users/index.ts')).toBe(true);
    expect(readFileSync('supabase/config.toml', 'utf8')).toMatch(/\[functions\.admin-users\][^[]*verify_jwt = true/);
    expect(doc).toMatch(/functions deploy admin-users/);
    expect(doc).toMatch(/service key stays inside Supabase/);
  });

  it('no longer says that accounts and passwords are managed in the dashboard', () => {
    const limits = doc.slice(doc.indexOf('## Limits'));
    expect(limits).not.toMatch(/in the Supabase dashboard/);
    expect(limits).toMatch(/Add user/);
  });

  it('states what the build does not do', () => {
    expect(doc).toMatch(/nothing here was deployed/i);
  });
});
