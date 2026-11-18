-- T3.3: row-level security for flows, flow_versions and flow_group_access (SPEC section 7).
--
-- Model (decision D58):
--   admin         everything, including deleted flows
--   owner (user)  full rights on the own personal flow
--   group member  view and run a shared flow of a group they belong to
--   other users   nothing
-- Helper functions are security definer with an empty search_path, so a policy can read profiles and
-- group_members without running into the policies of those tables.

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Can the caller see this flow? Deleted flows are visible to the admin only.
create function public.can_view_flow(p_flow_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.flows f
    where f.id = p_flow_id and f.deleted_at is null and (
      (f.scope = 'personal' and f.owner_id = auth.uid())
      or (f.scope = 'shared' and exists (
        select 1 from public.flow_group_access a
        join public.group_members m on m.group_id = a.group_id
        where a.flow_id = f.id and m.user_id = auth.uid()))));
$$;

-- Can the caller change this flow and its versions? Admin, or the owner of a live personal flow.
create function public.can_edit_flow(p_flow_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.flows f
    where f.id = p_flow_id and f.deleted_at is null and f.scope = 'personal' and f.owner_id = auth.uid());
$$;

create function public.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid());
$$;

revoke execute on function public.is_admin(), public.can_view_flow(uuid), public.can_edit_flow(uuid),
  public.is_group_member(uuid) from public, anon;
grant execute on function public.is_admin(), public.can_view_flow(uuid), public.can_edit_flow(uuid),
  public.is_group_member(uuid) to authenticated;

-- flows
create policy flows_select on public.flows for select to authenticated
  using (public.can_view_flow(id));
create policy flows_insert on public.flows for insert to authenticated
  with check (public.is_admin() or (owner_id = auth.uid() and scope = 'personal'));
create policy flows_update on public.flows for update to authenticated
  using (public.can_edit_flow(id))
  with check (public.is_admin() or (owner_id = auth.uid() and scope = 'personal'));
-- Users delete softly (deleted_at). Removing a row for good is for the admin.
create policy flows_delete on public.flows for delete to authenticated
  using (public.is_admin());

-- Only an admin may restore a deleted flow, whatever the policies say.
create function public.guard_flow_restore() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is not null and new.deleted_at is null and not public.is_admin() then
    raise exception 'Only an admin can restore a deleted flow. Ask an admin to restore "%".', old.name;
  end if;
  return new;
end $$;
create trigger flows_guard_restore before update on public.flows
  for each row execute function public.guard_flow_restore();

-- flow_versions follow the flow: seen by whoever can view the flow, changed by whoever can edit it.
create policy flow_versions_select on public.flow_versions for select to authenticated
  using (public.can_view_flow(flow_id));
create policy flow_versions_insert on public.flow_versions for insert to authenticated
  with check (public.can_edit_flow(flow_id));
create policy flow_versions_update on public.flow_versions for update to authenticated
  using (public.can_edit_flow(flow_id)) with check (public.can_edit_flow(flow_id));
create policy flow_versions_delete on public.flow_versions for delete to authenticated
  using (public.can_edit_flow(flow_id));

-- flow_group_access: the admin manages it; a member sees the rows of the groups they belong to.
create policy flow_group_access_select on public.flow_group_access for select to authenticated
  using (public.is_admin() or public.is_group_member(group_id));
create policy flow_group_access_write on public.flow_group_access for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
