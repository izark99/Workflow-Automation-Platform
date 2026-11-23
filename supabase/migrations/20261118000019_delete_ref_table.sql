-- An admin deletes a reference table for good (its versions go with it, by the foreign key). Flows point to a table by its name, so
-- a table that a live flow reads is refused, and the message names the flows. A soft-deleted flow does not count: if it is
-- restored later, its step says that the table is missing, which is the message the app already shows for a missing table.
-- The function is security invoker: the policies of migration 4 and 11 still decide who may delete a row. A call that changes
-- nothing (not an admin, a locked admin, no such table) says so with SQLSTATE P0002; a table in use is P0001.

create function public.delete_ref_table(p_ref_table_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_name text;
  v_flows text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete a reference table. Ask the admin.' using errcode = 'P0002';
  end if;
  select name into v_name from public.ref_tables where id = p_ref_table_id;
  if not found then
    raise exception 'This reference table does not exist. Go back to the Reference tables list.' using errcode = 'P0002';
  end if;
  select string_agg(distinct f.name, ', ' order by f.name) into v_flows
  from public.flow_ref_tables r
  join public.flows f on f.id = r.flow_id
  where f.deleted_at is null and lower(r.ref_table_name) = lower(v_name);
  if v_flows is not null then
    raise exception 'The reference table "%" is read by %. Remove it from those flows first, then delete it.', v_name, v_flows using errcode = 'P0001';
  end if;
  delete from public.ref_tables where id = p_ref_table_id;
  if not found then
    raise exception 'The reference table could not be deleted: this account may not change reference tables. Ask the admin.' using errcode = 'P0002';
  end if;
end $$;

revoke execute on function public.delete_ref_table(uuid) from public, anon;
grant execute on function public.delete_ref_table(uuid) to authenticated;
