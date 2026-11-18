-- T3.8: a function that touches the database and returns the time (decision D69).
-- Read only, takes no input, returns no data from any table. It may be called with the public anon key, which is
-- what the daily scheduled request uses. It reads one row of a real table so that the request is real database work.
create function public.keep_alive() returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
begin
  perform 1 from public.profiles limit 1;
  return now();
end $$;

revoke execute on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon, authenticated, service_role;
