# Keep-alive

A free Supabase project is paused after a week without requests. The daily keep-alive makes one small request so
that it is not.

## What it does

- `scripts/keep-alive.ts` calls the database function `keep_alive()` through the REST API with the **anon key**
  (the public key, the same one the app uses). The function reads one row and returns the time. It returns no data
  and changes nothing.
- If `SUPABASE_SERVICE_KEY` is also set, the script calls `purge_expired_flows()`, which removes the flows that were
  deleted 30 days ago or more (`docs/DECISIONS.md`, D60). The Admin screen does the same when an admin opens it.
  Without the service key the removal still happens that way; it only waits for an admin to open the screen.
- A server error or a lost connection is retried twice. A refused request (wrong key, migrations not applied) fails
  at once with a message. The keys are never printed.

## Set it up (GitHub Actions)

1. In the repository: Settings, Secrets and variables, Actions, New repository secret.
2. Add `SUPABASE_URL` (the project URL, `https://<ref>.supabase.co`) and `SUPABASE_ANON_KEY`.
3. Optional: add `SUPABASE_SERVICE_KEY` (the `service_role` key). It bypasses row-level security. Keep it only in
   this secret: never in the app, never in a `.env` file that is committed, never in a variable that the build reads.
4. Actions tab, workflow "Keep alive", Run workflow. It must finish green. It then runs every day at 03:17 UTC.

GitHub stops scheduled workflows in a repository with no activity for 60 days. If the repository is quiet that
long, open the Actions tab and enable the workflow again, or use the alternative below.

## Check it by hand

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon key> node scripts/keep-alive.ts
```

It prints `Database answered at <time>.` On a local Supabase, `npm run test:store` runs it against the local stack.

## Another scheduler

Any scheduler that can run `node scripts/keep-alive.ts` once a day with the same variables works, for example a
Cloudflare Workers cron trigger that sends `POST <SUPABASE_URL>/rest/v1/rpc/keep_alive` with the headers
`apikey: <anon key>` and `Authorization: Bearer <anon key>`.
