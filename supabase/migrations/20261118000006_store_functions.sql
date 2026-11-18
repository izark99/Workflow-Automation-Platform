-- T3.6b1: server functions behind the write side of SupabaseStore, and the last-admin rule. Decision D62.
-- All are security invoker, so the policies of T3.3 and T3.4 decide who may do what. They exist because a
-- client doing several calls cannot make them atomic, and cannot take "the next version number" without a race.
-- Note: an id is generated first and the row is inserted without RETURNING. A policy that calls a stable helper
-- (can_view_flow) cannot see the row its own statement inserted, so RETURNING would be refused.

create function public.create_flow(p_name text, p_scope text default 'personal') returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'A flow needs a name. Type a name and try again.' using errcode = '22023';
  end if;
  if p_scope is null or p_scope not in ('personal', 'shared') then
    raise exception 'The scope of a flow is personal or shared.' using errcode = '22023';
  end if;
  insert into public.flows (id, name, owner_id, scope) values (v_id, btrim(p_name), auth.uid(), p_scope);
  insert into public.flow_versions (flow_id, version_no, valid_from, status, change_note, definition)
  values (v_id, 1, current_date, 'draft', 'First version', '{"schemaVersion":1,"nodes":[],"edges":[]}'::jsonb);
  return v_id;
end $$;

-- A user copies a flow they can see into a personal flow with one draft version (SPEC section 7).
create function public.copy_flow(p_source uuid, p_name text default '') returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_name text;
  v_from date;
  v_def jsonb;
begin
  select name into v_name from public.flows where id = p_source;
  if not found then
    raise exception 'This flow does not exist or you cannot open it. Go back to the Flows list.' using errcode = 'P0002';
  end if;
  select valid_from, definition into v_from, v_def
    from public.flow_versions where flow_id = p_source order by version_no desc limit 1;
  insert into public.flows (id, name, owner_id, scope)
  values (v_id, coalesce(nullif(btrim(coalesce(p_name, '')), ''), v_name || ' (copy)'), auth.uid(), 'personal');
  insert into public.flow_versions (flow_id, version_no, valid_from, status, change_note, definition)
  values (v_id, 1, coalesce(v_from, current_date), 'draft', 'Copied from ' || v_name,
          coalesce(v_def, '{"schemaVersion":1,"nodes":[],"edges":[]}'::jsonb));
  return v_id;
end $$;

-- A new draft with the next number, empty or copied from another version. The flow row is locked, so two
-- callers cannot take the same number.
create function public.create_flow_version(p_flow_id uuid, p_valid_from date, p_copy_from integer default null,
                                           p_note text default '') returns integer
language plpgsql set search_path = '' as $$
declare
  v_no integer;
  v_def jsonb := '{"schemaVersion":1,"nodes":[],"edges":[]}'::jsonb;
begin
  perform 1 from public.flows where id = p_flow_id for update;
  if not found then
    raise exception 'This flow does not exist, or you may not change it.' using errcode = 'P0002';
  end if;
  if p_copy_from is not null then
    select definition into v_def from public.flow_versions where flow_id = p_flow_id and version_no = p_copy_from;
    if not found then
      raise exception 'Version v% does not exist. Pick a version from the list.', p_copy_from using errcode = 'P0002';
    end if;
  end if;
  select coalesce(max(version_no), 0) + 1 into v_no from public.flow_versions where flow_id = p_flow_id;
  insert into public.flow_versions (flow_id, version_no, valid_from, status, change_note, definition)
  values (p_flow_id, v_no, p_valid_from, 'draft', coalesce(p_note, ''), v_def);
  return v_no;
end $$;

create function public.create_ref_table(p_name text, p_description text, p_columns jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_name = '' then
    raise exception 'A reference table needs a name. Type a name and try again.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ref_tables where lower(name) = lower(v_name)) then
    raise exception 'A reference table named "%" exists. Choose another name.', v_name;
  end if;
  insert into public.ref_tables (id, name, description) values (v_id, v_name, coalesce(p_description, ''));
  insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows)
  values (v_id, 1, current_date, 'draft', coalesce(p_columns, '[]'::jsonb), '[]'::jsonb);
  return v_id;
end $$;

create function public.create_ref_table_version(p_table_id uuid, p_valid_from date, p_copy_from integer default null)
returns integer
language plpgsql set search_path = '' as $$
declare
  v_no integer;
  v_cols jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  perform 1 from public.ref_tables where id = p_table_id for update;
  if not found then
    raise exception 'This reference table does not exist, or you may not change it.' using errcode = 'P0002';
  end if;
  if p_copy_from is not null then
    select columns, rows into v_cols, v_rows
      from public.ref_table_versions where ref_table_id = p_table_id and version_no = p_copy_from;
    if not found then
      raise exception 'Version v% does not exist. Pick a version from the list.', p_copy_from using errcode = 'P0002';
    end if;
  end if;
  select coalesce(max(version_no), 0) + 1 into v_no from public.ref_table_versions where ref_table_id = p_table_id;
  insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows)
  values (p_table_id, v_no, p_valid_from, 'draft', v_cols, v_rows);
  return v_no;
end $$;

-- Admin only. Replaces the groups that can use a shared flow.
create function public.set_flow_groups(p_flow_id uuid, p_group_ids uuid[]) returns void
language plpgsql set search_path = '' as $$
declare
  v_scope text;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can change who can use a shared flow. Ask the admin.' using errcode = '42501';
  end if;
  select scope into v_scope from public.flows where id = p_flow_id;
  if not found then
    raise exception 'This flow does not exist or you cannot open it. Go back to the Flows list.' using errcode = 'P0002';
  end if;
  if v_scope <> 'shared' then
    raise exception 'Only a shared flow has group access. Make the flow shared first.' using errcode = '22023';
  end if;
  delete from public.flow_group_access where flow_id = p_flow_id;
  insert into public.flow_group_access (flow_id, group_id)
  select distinct p_flow_id, g.id from public.groups g where g.id = any (coalesce(p_group_ids, '{}'));
end $$;

-- Admin only. Replaces the groups of a user.
create function public.set_user_groups(p_user_id uuid, p_group_ids uuid[]) returns void
language plpgsql set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only the admin can change the groups of a user. Ask the admin.' using errcode = '42501';
  end if;
  delete from public.group_members where user_id = p_user_id;
  insert into public.group_members (group_id, user_id)
  select distinct g.id, p_user_id from public.groups g where g.id = any (coalesce(p_group_ids, '{}'));
end $$;

-- At least one admin must remain (the local store has the same rule).
create function public.guard_last_admin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin')
     and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'At least one admin is needed. Make another user an admin first, then change this user.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger profiles_guard_last_admin before update or delete on public.profiles
  for each row execute function public.guard_last_admin();

revoke execute on function public.create_flow(text, text), public.copy_flow(uuid, text),
  public.create_flow_version(uuid, date, integer, text), public.create_ref_table(text, text, jsonb),
  public.create_ref_table_version(uuid, date, integer), public.set_flow_groups(uuid, uuid[]),
  public.set_user_groups(uuid, uuid[]) from public, anon;
grant execute on function public.create_flow(text, text), public.copy_flow(uuid, text),
  public.create_flow_version(uuid, date, integer, text), public.create_ref_table(text, text, jsonb),
  public.create_ref_table_version(uuid, date, integer), public.set_flow_groups(uuid, uuid[]),
  public.set_user_groups(uuid, uuid[]) to authenticated;
