-- T3.6c2: names for the screens, for users who may not read profiles and groups (decision D65).
-- Returns the owners and the groups of the flows the caller can see (can_view_flow), and nothing else.
create function public.visible_names() returns table (kind text, id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select 'user'::text, p.id, p.name from public.profiles p
   where exists (select 1 from public.flows f where f.owner_id = p.id and public.can_view_flow(f.id))
  union all
  select 'group'::text, g.id, g.name from public.groups g
   where exists (select 1 from public.flow_group_access a where a.group_id = g.id and public.can_view_flow(a.flow_id));
$$;

revoke execute on function public.visible_names() from public, anon;
grant execute on function public.visible_names() to authenticated;
