-- T3.5: soft delete, restore, and removal after 30 days (SPEC section 7). Decision D60.
-- All functions are security invoker: the policies of T3.3 decide who may do what.
-- A call that changes nothing (not allowed, or no such flow) says so with SQLSTATE P0002.

-- A user deletes a personal flow, the admin any flow. The row stays, hidden, with deleted_at set.
create function public.delete_flow(p_flow_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  update public.flows set deleted_at = now() where id = p_flow_id and deleted_at is null;
  if not found then
    raise exception 'This flow does not exist, is already deleted, or you may not delete it.' using errcode = 'P0002';
  end if;
end $$;

-- Admin only. Brings back the flow and, with it, its versions and group access.
create function public.restore_flow(p_flow_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  update public.flows set deleted_at = null where id = p_flow_id and deleted_at is not null;
  if not found then
    raise exception 'This flow is not in the deleted list, or only an admin can restore it.' using errcode = 'P0002';
  end if;
end $$;

-- Admin only. Removes one deleted flow for good (versions, group access and run log go with it).
create function public.purge_flow(p_flow_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  delete from public.flows where id = p_flow_id and deleted_at is not null;
  if not found then
    raise exception 'This flow is not in the deleted list, or only an admin can remove it for good.' using errcode = 'P0002';
  end if;
end $$;

-- Removes every flow that has been deleted for 30 days or more and returns how many. Same rule as the
-- local store: a flow stays while deleted_at is later than now minus 30 days. For an admin (the Admin
-- screen calls it when it opens) or for the service role (the daily request of T3.8 can call it).
-- For any other user it removes nothing.
create function public.purge_expired_flows() returns integer
language plpgsql set search_path = '' as $$
declare
  removed integer;
begin
  delete from public.flows where deleted_at is not null and deleted_at <= now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke execute on function public.delete_flow(uuid), public.restore_flow(uuid), public.purge_flow(uuid),
  public.purge_expired_flows(), public.publish_flow_version(uuid, integer),
  public.publish_ref_table_version(uuid, integer) from public, anon;
grant execute on function public.delete_flow(uuid), public.restore_flow(uuid), public.purge_flow(uuid),
  public.purge_expired_flows(), public.publish_flow_version(uuid, integer),
  public.publish_ref_table_version(uuid, integer) to authenticated, service_role;
