-- The admin sets how many flows a user may own at one time (`profiles.max_flows`, null = no limit). A trigger on `flows` enforces
-- it on every insert, so create_flow, copy_flow and a direct insert are all covered. A deleted flow (deleted_at set) does not
-- count; an admin has no limit whatever the value. The message is the one the app shows (errors.flowLimit). SQLSTATE P0001.
-- Only an admin changes a profile (policy profiles_write of migration 4), so a user cannot raise their own limit.

alter table public.profiles add column max_flows integer check (max_flows is null or (max_flows >= 0 and max_flows <= 10000));

create function public.enforce_flow_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
  v_owned integer;
begin
  select max_flows into v_max from public.profiles where id = new.owner_id and role <> 'admin';
  if v_max is null then
    return new;
  end if;
  select count(*)::integer into v_owned from public.flows where owner_id = new.owner_id and deleted_at is null;
  if v_owned >= v_max then
    raise exception 'You have reached the limit of % flows that the admin set for you. Delete a flow, or ask the admin to raise the limit.', v_max using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger flows_enforce_limit before insert on public.flows
  for each row execute function public.enforce_flow_limit();

-- A trigger function is not meant to be called: nobody gets execute on it.
revoke execute on function public.enforce_flow_limit() from public, anon, authenticated;
