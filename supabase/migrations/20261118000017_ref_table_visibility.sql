-- T5.18: who reads the rows of a reference table (SPEC 12.1, SPEC 7). The name and the description of every table stay
-- visible to every signed-in, active user (`ref_tables_select` is not changed), so the Lookup and Pivot steps can offer
-- every table. The versions, with their columns and rows, are read by
--   an active admin, and
--   a person who may view a live flow that reads the table (`flow_ref_tables`, migration 16): the owner of a personal
--   flow, a member of a group that a shared flow is shared with. Any version of that flow counts, draft or published.
-- A soft-deleted flow does not count, because `can_view_flow()` is false for it. A locked user reads nothing, as before.
--
-- The check is a function, not a subquery in the policy, so that it runs with the rights of its owner: a person who
-- may not read `ref_table_versions` still gets a clear yes or no, and the rows of `flow_ref_tables` that the policy of
-- that table would hide cannot make the answer wrong.
create function public.can_read_ref_table(p_table_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1
    from public.ref_tables t
    join public.flow_ref_tables r on r.ref_table_name = t.name
    where t.id = p_table_id and public.can_view_flow(r.flow_id)
  );
$$;

revoke execute on function public.can_read_ref_table(uuid) from public, anon;
grant execute on function public.can_read_ref_table(uuid) to authenticated;

drop policy ref_table_versions_select on public.ref_table_versions;
create policy ref_table_versions_select on public.ref_table_versions for select to authenticated
  using (public.can_read_ref_table(ref_table_id));
