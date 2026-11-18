# Deploy

Steps for a person to put the app online: a Supabase project for the data and sign-in, Cloudflare Pages for the
app. The build loop never deploys and never holds real keys. Nothing here was deployed or run against a real
project; every step below was written from the local setup that the tests use (`npm run test:db`,
`npm run test:store`). Dashboard labels change over time, so look for the name given here, not for the exact place.

About 45 minutes the first time.

## Before you start

You need:

- A GitHub account that can read this repository (Cloudflare Pages builds from it).
- A Supabase account and a Cloudflare account. The free plans are enough for about 10 colleagues.
- Node 22 and a clone of the repository on your computer, with `npm ci` done once (this installs the Supabase CLI).
- The email addresses of the people who will sign in. One of them becomes the first admin.

What is stored where: flows, flow versions, reference tables, users, groups and the run history (counts only) live in
Supabase. The input files that people load never leave their browser. Do not put personal data in reference tables.

Two keys exist, and they are not the same:

| Key | Where it may go | What it can do |
| --- | --- | --- |
| `anon` (publishable) | The app, the build settings, GitHub secrets | Nothing by itself. Row-level security decides what a signed-in person may see |
| `service_role` | One GitHub secret for the keep-alive, nowhere else | Bypasses row-level security. Treat it like a password. It must never be in the app or in a committed file |

## Create the Supabase project

1. In the Supabase dashboard: New project. Pick the region closest to your colleagues and a strong database
   password. Save the password in your password manager: the next step asks for it.
2. When the project is ready, open Project Settings, then API (or "API Keys"). Note the **Project URL**
   (`https://<ref>.supabase.co`), the **anon / publishable key**, and the project reference (`<ref>`, the first part
   of the URL). Leave the `service_role` key where it is for now.

## Apply the migrations

The files in `supabase/migrations` create the tables, the row-level security, the functions and the sign-up trigger.
Apply them in order, once, from your computer:

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```

`link` asks for the database password from the first step. `db push` lists the migrations it will apply and asks you
to confirm. Check the result: in the dashboard, Table Editor shows the tables `profiles`, `groups`, `group_members`,
`flows`, `flow_versions`, `flow_group_access`, `ref_tables`, `ref_table_versions` and `run_log`, each with row-level
security on.

If a migration fails, stop. Read the first error, fix it on a local Supabase with `npm run test:db`, and push again.
Do not edit tables by hand in the dashboard: the next push would not know about the change.

## Close sign-ups

By default anyone who knows the project URL can create an account. Every new account gets a profile with the role
`user`, which can read all reference tables. Turn that off before anyone else sees the address:

1. Authentication, then the sign-in settings (named "Sign In / Providers" or "Providers" and "User Signups").
2. Turn off sign-ups: the switch "Allow new users to sign up" must be off.
3. Keep the Email provider on. People sign in with email and password. "Confirm email" can stay on: users you
   create yourself are confirmed in the next step.

From now on accounts are created by an admin in the dashboard (below). There is no sign-up and no "forgot password"
screen in the app: a person who forgets the password asks the admin, who sets a new one in Authentication, Users.

## Create the first admin

1. Authentication, Users, Add user, Create new user. Enter the email and a password, and tick "Auto confirm user".
   Repeat for every colleague. A profile with the role `user` appears for each account by itself, named after the
   part of the email before the `@`.
2. Make the first admin. Open the SQL editor and run this, with the real email address:

```sql
update public.profiles set role = 'admin' where email = 'first.admin@example.com';
```

   It must say that one row was updated. The role is never taken from anything a person types at sign-up, so this
   step is the only way to create the first admin.
3. Sign in to the app as that person (after the next step) and open Admin: the other people are listed there. The
   admin sets their names, roles and groups on that screen. The app cannot add accounts: that is done in the
   dashboard, as above.

## Deploy the app on Cloudflare Pages

**Known blocker: do not start this step before you read this.** The build puts two DuckDB-WASM files in `dist/assets`:
`duckdb-mvp-<hash>.wasm` (about 40 MB) and `duckdb-eh-<hash>.wasm` (about 35 MB). Cloudflare Pages accepts at most
25 MiB for a single file (Cloudflare's documentation, "Pages, Limits"; Workers static assets have the same limit), so
the upload of the build fails on these two files. The app is built this way on purpose (`docs/DECISIONS.md`, D7: the
engine code is a static asset of the app, so a run makes no request for code). The decision of where to serve these
two files from is open and is listed under "Needs Harold" in `PROGRESS.md`. The options:

- **A. Serve the two files from a public R2 bucket** (Cloudflare's own advice for large files). The app stays on
  Pages; the build is changed to leave the two files out and to load them from the bucket's address, which must send a
  CORS header for the app's address. Still no file content leaves the browser, but engine code now comes from a second
  address. This is the recommended option and needs one build task once you choose it.
- **B. Serve the whole app from a host that accepts files of 40 MB or more.** No code change. Check that host's
  file size limit first.
- **C. Ask Cloudflare to raise the limit** with their limit increase form. Not guaranteed, and it can take time.

Until one is chosen, steps 1 to 5 below describe the Pages setup that applies to options A and B (for B, read
"Pages" as that host).

1. Cloudflare dashboard: Workers & Pages, Create, Pages, Connect to Git. Pick this repository and the branch to
   publish.
2. Build settings:
   - Framework preset: None
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Environment variables (production, and preview if you use it):

   | Name | Value |
   | --- | --- |
   | `NODE_VERSION` | `22` |
   | `VITE_SUPABASE_URL` | the Project URL |
   | `VITE_SUPABASE_ANON_KEY` | the anon / publishable key |

   Both `VITE_` variables must be set, or neither. With only one, the app does not start and the browser console
   names the missing one. With neither, the app runs on browser storage with demo data and no sign-in, so a
   missing variable is easy to spot: you see no sign-in screen.
   Do not put the service key in Cloudflare, in a `.env` file, or in any variable that starts with `VITE_`: everything
   the build reads ends up in files that every visitor downloads.
4. Save and deploy. The first build takes a few minutes. The app is a set of static files. Pages opens `index.html` for any page address when the project has no `404.html`,
   which this one does not, so a link such as `/flows` works.
5. Back in Supabase, Authentication, URL Configuration: set the Site URL to the address of your Pages project
   (`https://<name>.pages.dev`, or your own domain). Add the same address under Redirect URLs.

## Keep the project awake

A free Supabase project is paused after a week without requests. Set up the daily request as in
`docs/KEEP_ALIVE.md`: two or three GitHub secrets and one manual run of the workflow in
`.github/workflows/keep-alive.yml`. The optional `SUPABASE_SERVICE_KEY` secret is the only place the `service_role`
key goes.

## Check it works

Do these in order; each one proves a different part.

1. Open the Pages address. You see the sign-in screen, not the app.
2. Sign in with a wrong password: the message says that the email or the password is wrong.
3. Sign in as the first admin: the Flows screen opens, and the sidebar has Admin and Sign out.
4. Create a personal flow. Sign out, sign in as another colleague: they do not see it, and they have no Admin item.
5. As the admin, create a shared flow in Admin or Flows and give a group access (create the group and add the
   colleague first). The colleague sees it, can run it, and cannot edit it, but can copy it to a personal flow.
6. Check that a visitor without an account gets nothing. In a terminal, with your real values:

```bash
curl -s "https://<ref>.supabase.co/rest/v1/flows" -H "apikey: <anon key>"
```

   The answer must be an error that says permission denied, not a list.
7. Run a flow with a real input file and download the result. In the browser's network tab, no request carries the
   file: the data requests only go to your Supabase project.
8. In GitHub, Actions, run "Keep alive" by hand and check that it finishes green.

If a step fails, the cause is almost always one of: a `VITE_` variable missing or with a typo (the app runs on demo
data), the migrations not applied (sign-in works but the app says the profile is missing), or the first-admin step
not run.

## Limits

- No sign-up, no password reset and no email invitation in the app. The admin creates accounts and resets passwords
  in the Supabase dashboard.
- A person without a profile (for example an account whose email matches another profile) can sign in but sees a
  message that they have no profile. Fix it in the dashboard: change the email, then ask them to sign in again.
- A reference table version holds at most 50,000 rows. Published versions cannot change; a change is a new version.
- Run history stores counts and ids only, never file content.
- Backups and point-in-time recovery depend on your Supabase plan. Check what your plan offers before the data
  matters. The app has no export of flows or reference tables.
- Choices made during the build, and why, are in `docs/DECISIONS.md` (the server part starts at D55).
