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

What is stored where: flows, flow versions, reference tables, users, groups, the edited UI texts and the run history (counts only) live in
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

## Deploy the account function

The Admin screen creates users, resets passwords and locks accounts through one Edge Function,
`supabase/functions/admin-users`. It is the only server code of the app. It checks for itself that the caller is an
active admin, so the service key stays inside Supabase: Supabase gives it to the function, and you do not copy it
anywhere.

```bash
npx supabase functions deploy admin-users --project-ref <ref>
```

The setting `verify_jwt = true` in `supabase/config.toml` stays on. In the dashboard, Edge Functions lists
`admin-users` as active. You test it in "Check it works" (step 9).

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

**Use `npm run build:pages` as the build command, not `npm run build`.** The engine needs two DuckDB-WASM files of
about 40 MB and 35 MB. Cloudflare Pages accepts at most 25 MiB for a single file, so `npm run build:pages` leaves
them out and the browser loads them from jsDelivr (`cdn.jsdelivr.net`), pinned to the exact package version in
`package.json` (`docs/DECISIONS.md`, D71). The script stops the build if any file in `dist` is still above 25 MiB.

What this means for you:

- Every colleague's browser must reach `cdn.jsdelivr.net`. If the company network or a proxy blocks it, a run stops
  with a message that names the host. Ask IT to allow `cdn.jsdelivr.net` before you roll out.
- Only engine code comes from jsDelivr, with a plain download. Input file content still never leaves the browser
  (`npm run test:acceptance:pages` checks this on the Pages build).
- The app now depends on a third-party CDN being up. If that is not acceptable, serve the two files from your own
  R2 bucket instead; that needs a build change.

1. Cloudflare dashboard: Workers & Pages, Create, Pages, Connect to Git. Pick this repository and the branch to
   publish.
2. Build settings:
   - Framework preset: None
   - Build command: `npm run build:pages`
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
   file: the data requests only go to your Supabase project, and the only other host is `cdn.jsdelivr.net` (plain
   downloads of the engine code).
8. In GitHub, Actions, run "Keep alive" by hand and check that it finishes green.
9. As the admin, open Admin, Users, Add user, and create a test account with a first password of at least 10
   characters. Sign in as that user in a private window: the app asks for a new password before anything else. Back
   as the admin, lock the test user: their next request is refused and they see that the account is locked. Admin has
   no delete for users, so leave the test account locked when you are done.

If a run says the data engine could not be loaded from cdn.jsdelivr.net, the network blocks jsDelivr: ask IT to
allow it.

If a step fails, the cause is almost always one of: a `VITE_` variable missing or with a typo (the app runs on demo
data), the migrations not applied (sign-in works but the app says the profile is missing), or the first-admin step
not run.

## Upgrade an existing deployment

Phase 4 added accounts managed in the app, a light and a dark theme, editable texts in English and Vietnamese, and flow
parameters. A deployment that was set up with the nine earlier migrations needs these steps, in this order. A fresh
deployment does not: "Apply the migrations" already applies all of them.

1. **Back up first.** In the Supabase dashboard, Database, Backups: take a backup if your plan has one, and write down
   the time. The migrations add columns and tables and change policies; they do not delete data, but you cannot undo
   a policy change by hand. The app has no export of flows or reference tables.
2. **Apply the new migrations** from your computer (`npx supabase link --project-ref <ref>` once, if you have not):

   ```bash
   npx supabase db push
   ```

   It lists four files, `20261118000010_ui_texts.sql`, `20261118000011_account_lock.sql`,
   `20261118000012_end_sessions.sql` and `20261118000013_ui_text_stamp_revoke.sql`, and asks you to confirm. Existing users stay active and are not asked for a new
   password. If the push fails, stop and read the first error; do not edit tables by hand.
3. **Deploy the account function**, which is new in this phase:

   ```bash
   npx supabase functions deploy admin-users --project-ref <ref>
   ```

4. **Deploy the app.** Pushing to the branch that Cloudflare Pages builds starts the build (`npm run build:pages`).
   Wait for it to finish. Do steps 2 and 3 before this one, so the new app finds the new database and the function.
5. **Check it**, in this order:
   - Accounts: open Admin, Users. Every existing user shows Active. Add a test user, sign in as them in a private
     window (the app asks for a new password), then lock them from Admin and see that their next request is refused.
   - Themes: in the sidebar, pick Light, Dark and System. The page changes at once and the choice is kept after a
     reload.
   - Texts: in the sidebar, switch to Vietnamese. In Admin, Texts, edit one text (for example `nav.flows`), reload as
     another user and see the new text. Use Reset to give it back.
   - Parameters: open a flow in the builder, select nothing and look at the Parameters panel on the right. Flows that
     were built before this phase have none and run as before. Add a date parameter to a new draft, use it in a Filter
     with `PARAM("key")`, publish, and run: the Run screen shows the value next to the files.
6. **If something is wrong,** the app can be rolled back in Cloudflare Pages (Deployments, pick the previous one,
   Rollback). The database changes stay; the old app ignores them. Do not undo a migration by hand.

## Upgrade from Phase 4

Phase 5 added the import of csv and xlsx files into reference tables, a rule for who reads the rows of a table, sign-out
after inactivity, both languages of a text in one Save, and panels that collapse. A deployment that is on Phase 4 (the
thirteen migrations and the `admin-users` function) needs these steps, in this order. A fresh deployment does not:
"Apply the migrations" already applies all of them.

1. **Back up first.** In the Supabase dashboard, Database, Backups: take a backup if your plan has one, and write down
   the time. Migration 17 changes who can read the rows of a reference table, and you cannot undo a policy change by
   hand. The app has no export of flows or reference tables.
2. **Apply the new migrations** from your computer (`npx supabase link --project-ref <ref>` once, if you have not):

   ```bash
   npx supabase db push
   ```

   It lists four files, `20261118000014_save_ui_texts.sql`, `20261118000015_app_settings.sql`,
   `20261118000016_flow_ref_tables.sql` and `20261118000017_ref_table_visibility.sql`, and asks you to confirm.
   Migration 15 sets the sign-out limit to 8 hours. Migration 16 fills the list of which flows read which tables, from
   the flows that exist. Nobody has to do anything for a user to keep reading the tables of their own flows. If the push
   fails, stop and read the first error; do not edit tables by hand.
3. **There is no new function.** `admin-users` stays as it is; do not deploy it again.
4. **Deploy the app.** Pushing to the branch that Cloudflare Pages builds starts the build (`npm run build:pages`).
   Wait for it to finish. Do step 2 before this one, so the new app finds the new database.
5. **Check it**, in this order:
   - Import: sign in as the admin, open Reference tables, Import file, choose a small csv file and import it into a
     new table. The new draft opens, with a note that it is a draft. Look at it, then publish it or leave it.
   - Who sees what: sign in as a user who has a flow that reads one table. Reference tables lists that table, read-only,
     with "Used by" and the name of the flow. A table that none of the user's flows reads is not listed.
   - Sign-out: in Admin, Settings, set "Hours without activity" to 1, save, and leave a signed-in tab alone. Two
     minutes before the hour a dialog counts down; at the hour the sign-in screen says that the person was signed out
     after 1 hour. Set the value back to what you want.
   - Texts: in Admin, Texts, edit one text in English and in Vietnamese with one Save, then reload and see both.
   - Panels: collapse the sidebar and a panel of the builder, reload, and see that they stay collapsed.
6. **If something is wrong,** the app can be rolled back in Cloudflare Pages (Deployments, pick the previous one,
   Rollback). The database changes stay; the Phase 4 app ignores the new tables, but it can no longer read the rows
   of a table that none of the user's flows reads (migration 17). Do not undo a migration by hand.

## Upgrade from Phase 5

Phase 6 added steady dragging of steps on the canvas, a Reference table step, parameters in the input boxes of every step,
and the reading of a table that sits inside a larger sheet (a title above, a footer below), with "Analyze file" to propose
the settings. A deployment that is on Phase 5 (the seventeen migrations and the `admin-users` function) needs these steps, in
this order. A fresh deployment does not: "Apply the migrations" already applies all of them.

1. **Back up first.** In the Supabase dashboard, Database, Backups: take a backup if your plan has one, and write down
   the time. Migration 18 changes which tables a flow is said to read, and so who can read the rows of a table. The app has
   no export of flows or reference tables.
2. **Apply the new migration** from your computer (`npx supabase link --project-ref <ref>` once, if you have not):

   ```bash
   npx supabase db push
   ```

   It lists one file, `20261118000018_ref_table_names_reference_step.sql`, and asks you to confirm. It makes a Reference table
   step count as reading its table, and fills the list of which flows read which tables again from the flows that exist.
   Nobody has to do anything for a user to keep reading the tables of their own flows. If the push fails, stop and read the
   first error; do not edit tables by hand.
3. **There is no new function.** `admin-users` stays as it is; do not deploy it again.
4. **Deploy the app.** Pushing to the branch that Cloudflare Pages builds starts the build (`npm run build:pages`).
   Wait for it to finish. Do step 2 before this one, so the new app finds the new database.
5. **Check it**, in this order:
   - Reference table step: sign in as a user who is not the admin, open a draft flow, drag "Reference table" onto the
     canvas and choose a table. Before the flow is saved the step says "You cannot read this table yet. Save the flow to
     read this table."; after Save draft it lists the columns, and Reference tables shows the table with the flow under
     "Used by".
   - Date check: publish a flow version that starts after the last version of a table that it reads. The dialog shows a
     quiet warning with the table and the days, and Publish stays enabled.
   - Parameters in input boxes: add a parameter in the Parameters panel, press the link button beside "Sheet name" of an
     Input step and choose it. The field becomes "Parameter: ...". On the Test tab "Now: ..." shows the value, and the Run
     screen lists the setting under "Settings that use a parameter".
   - Analyze file: on the Test tab of an Input step choose a test file that has a title above its table, press "Analyze
     file", look at the proposal and its reasons, and press "Apply to the step". Nothing is applied until you do.
   - Dragging: drag a step across the canvas. No step disappears, and the flow shows "Unsaved changes" once.
6. **If something is wrong,** think before you roll back the app in Cloudflare Pages. The database change stays and is
   harmless, but the Phase 5 app cannot run a flow that has a Reference table step (it does not know the step) or open a
   flow version that uses a parameter in an input box (it reads definition versions 1 and 2, and this is version 3). Roll back
   only while nobody has saved such a flow. Do not undo a migration by hand.

## Upgrade from Phase 6

Phase 7 changed the look of the app and nothing else: the Harold design system (glass panels over a soft blue scene, a new type,
new icons, light and dark themes). A deployment that is on Phase 6 needs only the last two steps of this list. A fresh deployment
does not need any of it.

1. **There is no migration.** The database is the same (migrations 1 to 18). Do not run `npx supabase db push` for this upgrade.
2. **There is no new function.** `admin-users` stays as it is; do not deploy it again.
3. **The fonts are served by the app.** Be Vietnam Pro and JetBrains Mono are part of the build (`@fontsource`), so no request goes to
   a font host and no setting in Cloudflare or Supabase has to change. The size limit of a Pages file is not affected: the Pages
   build (`npm run build:pages`) still checks it.
4. **Deploy the app.** Pushing to the branch that Cloudflare Pages builds starts the build. Wait for it to finish.
5. **Check it**, in this order:
   - Themes: in the sidebar footer choose Light, Dark and System in turn. Text is readable on every screen in each, and with System
     on a browser that has no preference the app is dark.
   - Fonts: Vietnamese text (for example the sign-in screen in "Tiếng Việt") shows its marks, none cut off at the top of a line.
   - Dragging: open a flow, drag a step across the canvas. No step disappears, the drag follows the pointer without jumps, and the
     flow shows "Unsaved changes" once.
   - A run: run a flow on a sample file and download the workbook. It opens and has the same sheets as before.
6. **If something is wrong,** roll back the app in Cloudflare Pages. Nothing in the database or in a saved flow depends on the new
   look, so a rollback is safe at any time. Do not undo a migration: there is none.

## Limits

- There is no sign-up and no email invitation. The admin creates accounts in the app (Admin, Users, Add user) with a
  first password that the person must change at the first sign-in, and resets a password the same way. Nobody can
  reset their own forgotten password: ask the admin. The app does not send email.
- The app does not delete users. Lock an account to stop it; a locked account cannot sign in and its sessions end.
- A person without a profile (for example an account whose email matches another profile) can sign in but sees a
  message that they have no profile. Fix it in the dashboard: change the email, then ask them to sign in again.
- A reference table version holds at most 50,000 rows. Published versions cannot change; a change is a new version.
- Run history stores counts and ids only, never file content.
- Backups and point-in-time recovery depend on your Supabase plan. Check what your plan offers before the data
  matters. The app has no export of flows or reference tables.
- Parameter values and the texts that people type into a flow stay in the browser; the run history keeps counts only.
- Sign-out after inactivity is checked in the browser. It removes the session from the browser, but the access token that
  Supabase issued stays valid until it expires, up to one hour later. A person who copied the token could use it for that
  time; lock the account (Admin, Users) to stop it at once.
- A user reads the rows of a reference table only when a live flow that they may view reads it (their own personal flows,
  and shared flows of their groups, in any version). A deleted flow does not count. Everyone signed in sees the name and the
  description of every table, so a step can offer it; the rows appear after the flow that reads the table is saved. A
  reference table is shared with every user who has such a flow, so it must not hold personal data.
- "Analyze file" reads the sample file in the browser and keeps nothing: the file is never uploaded or stored, and only the
  settings that you apply are saved with the flow. The analysis is a proposal. It can be wrong, in particular for a sheet
  with several tables or with nothing that marks the end of a table, and it says so with a low confidence; look at the
  preview before you apply it.
- A csv file whose cells hold a line break inside quotes is read in order of its rows, not by the line of the file, so
  "header row" and "rows to skip" count rows for such a file.
- A parameter in an input box is filled with the value that the person gives on the Run screen; the resolved values stay in
  the browser and the run history keeps counts only.
- Choices made during the build, and why, are in `docs/DECISIONS.md` (the server part starts at D55; accounts, texts and parameters start at D72).
