-- T4.8b: ending the sessions of a user (decision D76). The Edge Function `admin-users` calls this after a lock and after
-- a password reset, with the service role. Deleting the Auth sessions deletes their refresh tokens (cascade), so the
-- open sessions of that user cannot get a new access token. An access token that was already issued stays valid until it
-- expires (one hour); a locked account is refused by the database meanwhile (D75), and a reset needs no more than that.
create function public.admin_end_sessions(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_count = row_count;
  delete from auth.refresh_tokens where user_id = p_user::text;
  return v_count;
end $$;

revoke execute on function public.admin_end_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_end_sessions(uuid) to service_role;
