-- T3.2: constraints on versions (SPEC section 4, rules 2, 5 and 6; section 8, 50,000 rows).

create extension if not exists btree_gist with schema extensions;

-- Rule 2: published versions of one flow, or of one reference table, never share a day.
-- An empty valid_to is an open end. Drafts do not count (same as planPublish in src/engine/versions.ts).
alter table public.flow_versions
  add constraint flow_versions_no_overlap exclude using gist (
    flow_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  ) where (status = 'published');

alter table public.ref_table_versions
  add constraint ref_table_versions_no_overlap exclude using gist (
    ref_table_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  ) where (status = 'published');

-- At most 50,000 rows in one reference table version.
alter table public.ref_table_versions
  add constraint ref_table_versions_row_cap check (jsonb_array_length(rows) <= 50000);

-- Rule 5: a published version is read-only, for everyone, the admin included.
-- The one change allowed is rule 6: the publish functions below set valid_to of the previous open-ended
-- version. They do it by setting `app.closing_version` for the transaction. That setting cannot be reached
-- through the API, which only calls functions in the public schema.
-- A delete is refused unless it comes from a cascade (a purge of the flow or table), where the trigger
-- depth is above 1.
create function public.guard_published_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' and pg_trigger_depth() = 1 then
      raise exception 'Version % is published and cannot be deleted. Publish a new version instead.', old.version_no;
    end if;
    return old;
  end if;

  if old.status = 'published' then
    if current_setting('app.closing_version', true) = 'on'
       and old.valid_to is null and new.valid_to is not null
       and (to_jsonb(new) - 'valid_to') = (to_jsonb(old) - 'valid_to') then
      return new;
    end if;
    raise exception 'Version % is published and read-only. Create a new version copied from it.', old.version_no;
  end if;
  return new;
end $$;

create trigger flow_versions_guard before update or delete on public.flow_versions
  for each row execute function public.guard_published_version();
create trigger ref_table_versions_guard before update or delete on public.ref_table_versions
  for each row execute function public.guard_published_version();

-- Rule 6: publish a draft and end the previous open-ended published version, in one call.
-- Security invoker: row-level security of the caller applies (policies come in T3.3 and T3.4).
create function public.publish_flow_version(p_flow_id uuid, p_version_no integer) returns void
language plpgsql set search_path = '' as $$
declare
  v public.flow_versions;
begin
  select * into v from public.flow_versions where flow_id = p_flow_id and version_no = p_version_no for update;
  if not found then
    raise exception 'Version % of this flow does not exist.', p_version_no using errcode = 'P0002';
  end if;
  if v.status = 'published' then
    raise exception 'Version % is already published.', p_version_no;
  end if;

  perform set_config('app.closing_version', 'on', true);
  update public.flow_versions
     set valid_to = v.valid_from - 1
   where flow_id = p_flow_id and status = 'published' and valid_to is null
     and valid_from < v.valid_from;
  perform set_config('app.closing_version', 'off', true);

  update public.flow_versions set status = 'published' where flow_id = p_flow_id and version_no = p_version_no;
end $$;

create function public.publish_ref_table_version(p_ref_table_id uuid, p_version_no integer) returns void
language plpgsql set search_path = '' as $$
declare
  v public.ref_table_versions;
begin
  select * into v from public.ref_table_versions
   where ref_table_id = p_ref_table_id and version_no = p_version_no for update;
  if not found then
    raise exception 'Version % of this reference table does not exist.', p_version_no using errcode = 'P0002';
  end if;
  if v.status = 'published' then
    raise exception 'Version % is already published.', p_version_no;
  end if;

  perform set_config('app.closing_version', 'on', true);
  update public.ref_table_versions
     set valid_to = v.valid_from - 1
   where ref_table_id = p_ref_table_id and status = 'published' and valid_to is null
     and valid_from < v.valid_from;
  perform set_config('app.closing_version', 'off', true);

  update public.ref_table_versions set status = 'published'
   where ref_table_id = p_ref_table_id and version_no = p_version_no;
end $$;
