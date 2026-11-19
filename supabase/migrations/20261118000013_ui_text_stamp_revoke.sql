-- T4.13 (found by the security advisor after the live upgrade): `stamp_ui_text()` is a trigger function and must not be
-- callable as a function. Migration 10 left the default EXECUTE grant on it, so `anon` and `authenticated` could name it
-- in /rest/v1/rpc. PostgREST cannot run a trigger function, so nothing was exposed, but the function is not for them, and
-- `guard_account_columns()` already has this revoke (migration 11).
-- A trigger does not need EXECUTE for the role that writes the row, so the stamping of updated_by and updated_at goes on.
revoke execute on function public.stamp_ui_text() from public, anon, authenticated;
