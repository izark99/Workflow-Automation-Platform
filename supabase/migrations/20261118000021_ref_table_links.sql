-- Migration 21 (Phase 9, SPEC 16.2): reference tables that take their values from a column of another table.
--
-- A table B can be linked to a column of a table A. B's key column then holds the distinct values of that column. When a version of A
-- is published, the values that B does not hold yet are added to the draft of B in the same transaction; B is never published by it.
-- The admin sees a notice for each table that got values, until the draft that holds them is published.
--
-- A refusal of an input is SQLSTATE 22023 (the store says `invalid`); a conflict with other tables is P0001 (`conflict`); a missing table or an
-- admin-only call is P0002.
-- The functions are security invoker: the policies of migration 4 (admin writes) still decide what a caller may change. The texts of the
-- refusals are the texts of `src/store/messages.ts`; a test keeps them equal. Names are listed in the order of the `C` collation.

alter table public.ref_tables
  add column link_table_id uuid references public.ref_tables (id) on delete restrict,
  add column link_column text,
  add column key_column text,
  add constraint ref_tables_link_all_or_none check (
    (link_table_id is null and link_column is null and key_column is null)
    or (link_table_id is not null and btrim(coalesce(link_column, '')) <> '' and btrim(coalesce(key_column, '')) <> '')
  ),
  add constraint ref_tables_link_not_self check (link_table_id is null or link_table_id <> id);
create index ref_tables_link_idx on public.ref_tables (link_table_id) where link_table_id is not null;

-- The notices. One open notice per linked table collects the values added to its draft; it closes when that draft is published or the
-- table is unlinked. Admin only: no policy for anyone else, so a user reads and writes nothing.
create table public.ref_table_link_events (
  id uuid primary key default gen_random_uuid(),
  ref_table_id uuid not null references public.ref_tables (id) on delete cascade,
  source_table_id uuid not null references public.ref_tables (id) on delete cascade,
  link_column text not null,
  draft_version_no integer not null,
  new_values jsonb not null default '[]'::jsonb check (jsonb_typeof(new_values) = 'array'),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index ref_table_link_events_open_key on public.ref_table_link_events (ref_table_id) where closed_at is null;
alter table public.ref_table_link_events enable row level security;
create policy ref_table_link_events_admin on public.ref_table_link_events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Like every table: a locked account reads and writes nothing (migration 11).
create policy ref_table_link_events_active_only on public.ref_table_link_events as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.ref_table_link_events from anon;

-- ---------------------------------------------------------------------------------------------------------------------------
-- The pure rules (the same cases as src/engine/reflink, in supabase/tests/ref-link-cases.json).

-- The distinct values of a list of cells: text trimmed, blanks out, case and accents count, the order of the first appearance.
create function public.ref_link_distinct(p_cells jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_cell jsonb;
  v_text text;
begin
  for v_cell in select value from jsonb_array_elements(p_cells) loop
    if jsonb_typeof(v_cell) = 'null' then continue; end if;
    v_text := btrim(v_cell #>> '{}');
    if v_text = '' or v_text = any (v_seen) then continue; end if;
    v_seen := v_seen || v_text;
    v_out := v_out || to_jsonb(v_text);
  end loop;
  return v_out;
end $$;

-- The values that the keys do not hold, in the order of `p_values`.
create function public.ref_link_new_values(p_values jsonb, p_keys jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(v.value order by v.ord), '[]'::jsonb)
  from jsonb_array_elements(p_values) with ordinality as v(value, ord)
  where not exists (select 1 from jsonb_array_elements(p_keys) k where k.value = v.value)
$$;

-- The start of the draft of B that a publish of A makes (SPEC 16.2 item 3; decision D139).
create function public.ref_link_draft_start(p_a_start date, p_has_last boolean, p_last_from date, p_last_to date, p_today date) returns date
language sql immutable set search_path = '' as $$
  select case
    when not p_has_last then p_today
    when p_a_start > p_last_from then p_a_start
    else coalesce(p_last_to, p_last_from) + 1
  end
$$;

-- The published version of A that gives the values when a link is made: the one in effect on p_today, else the last published one.
create function public.ref_link_version_in_effect(p_ref_table_id uuid, p_today date) returns integer
language sql stable set search_path = '' as $$
  select version_no from public.ref_table_versions
  where ref_table_id = p_ref_table_id and status = 'published'
  order by (valid_from <= p_today and (valid_to is null or p_today <= valid_to)) desc, valid_from desc, version_no desc
  limit 1
$$;

-- The names of the tables of a cycle that a link of B to A would make, as `B → A → ... → B`, or null.
create function public.ref_link_cycle(p_b uuid, p_a uuid) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_path text;
  v_current uuid := p_a;
  v_name text;
  v_next uuid;
  v_steps integer := 0;
begin
  select name into v_path from public.ref_tables where id = p_b;
  if not found then return null; end if;
  while v_current is not null and v_steps < 1000 loop
    select name, link_table_id into v_name, v_next from public.ref_tables where id = v_current;
    exit when not found;
    v_path := v_path || ' → ' || v_name;
    if v_current = p_b then return v_path; end if;
    v_current := v_next;
    v_steps := v_steps + 1;
  end loop;
  return null;
end $$;

-- The keys that a table holds in its key column, in any version, draft or published: trimmed text, blanks out.
create function public.ref_link_keys(p_ref_table_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_key text;
  v_out jsonb := '[]'::jsonb;
  v_ver record;
  v_idx integer;
begin
  select key_column into v_key from public.ref_tables where id = p_ref_table_id;
  if v_key is null then return v_out; end if;
  for v_ver in select columns, rows from public.ref_table_versions where ref_table_id = p_ref_table_id loop
    select (c.ord - 1)::integer into v_idx from jsonb_array_elements(v_ver.columns) with ordinality as c(col, ord) where c.col ->> 'name' = v_key limit 1;
    if v_idx is null then continue; end if;
    v_out := v_out || public.ref_link_distinct(coalesce((select jsonb_agg(r.value -> v_idx) from jsonb_array_elements(v_ver.rows) r), '[]'::jsonb));
  end loop;
  return public.ref_link_distinct(v_out);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- The cascade.

-- Adds the values that B does not hold to its draft (made as a copy of the latest published version when there is none), and opens or
-- extends its notice. Returns the number of the draft, or null when nothing was added.
create function public.ref_link_add_values(p_b uuid, p_values jsonb, p_a_start date, p_source uuid) returns integer
language plpgsql set search_path = '' as $$
declare
  v_b public.ref_tables;
  v_fresh jsonb;
  v_draft public.ref_table_versions;
  v_last public.ref_table_versions;
  v_columns jsonb;
  v_rows jsonb;
  v_k integer;
  v_n integer;
  v_value jsonb;
  v_no integer;
begin
  select * into v_b from public.ref_tables where id = p_b;
  v_fresh := public.ref_link_new_values(p_values, public.ref_link_keys(p_b));
  if jsonb_array_length(v_fresh) = 0 then return null; end if;

  select * into v_draft from public.ref_table_versions where ref_table_id = p_b and status = 'draft' order by version_no desc limit 1;
  if found then
    v_columns := v_draft.columns;
    v_rows := v_draft.rows;
  else
    select * into v_last from public.ref_table_versions where ref_table_id = p_b and status = 'published' order by valid_from desc limit 1;
    v_columns := case when v_last.ref_table_id is null then '[]'::jsonb else v_last.columns end;
    v_rows := case when v_last.ref_table_id is null then '[]'::jsonb else v_last.rows end;
  end if;

  -- The key column is the first column when the table has none of that name.
  select (c.ord - 1)::integer into v_k from jsonb_array_elements(v_columns) with ordinality as c(col, ord) where c.col ->> 'name' = v_b.key_column limit 1;
  if v_k is null then
    v_columns := jsonb_build_array(jsonb_build_object('name', v_b.key_column, 'type', 'text')) || v_columns;
    v_rows := coalesce((select jsonb_agg(jsonb_build_array(null::text) || r.value order by r.ord) from jsonb_array_elements(v_rows) with ordinality as r(value, ord)), '[]'::jsonb);
    v_k := 0;
  end if;
  v_n := jsonb_array_length(v_columns);
  for v_value in select value from jsonb_array_elements(v_fresh) loop
    v_rows := v_rows || jsonb_build_array((select jsonb_agg(case when i - 1 = v_k then v_value else 'null'::jsonb end order by i) from generate_series(1, v_n) i));
  end loop;

  if v_draft.ref_table_id is not null then
    update public.ref_table_versions set columns = v_columns, rows = v_rows where ref_table_id = p_b and version_no = v_draft.version_no;
    v_no := v_draft.version_no;
  else
    select coalesce(max(version_no), 0) + 1 into v_no from public.ref_table_versions where ref_table_id = p_b;
    insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status, columns, rows)
    values (p_b, v_no, public.ref_link_draft_start(p_a_start, v_last.ref_table_id is not null, v_last.valid_from, v_last.valid_to, current_date), null, 'draft', v_columns, v_rows);
  end if;

  update public.ref_table_link_events
     set new_values = new_values || (select coalesce(jsonb_agg(f.value), '[]'::jsonb) from jsonb_array_elements(v_fresh) f where not (new_values @> jsonb_build_array(f.value))),
         draft_version_no = v_no, source_table_id = p_source, link_column = v_b.link_column
   where ref_table_id = p_b and closed_at is null;
  if not found then
    insert into public.ref_table_link_events (ref_table_id, source_table_id, link_column, draft_version_no, new_values)
    values (p_b, p_source, v_b.link_column, v_no, v_fresh);
  end if;
  return v_no;
end $$;

-- Gives every table linked to `p_source` the values of a version (its columns, rows and start) that they do not hold yet, and goes on down
-- a chain: a table that was changed gives the values of its draft to the tables linked to it. Nothing is published.
create function public.ref_link_feed(p_source uuid, p_columns jsonb, p_rows jsonb, p_valid_from date) returns void
language plpgsql set search_path = '' as $$
declare
  v_b record;
  v_i integer;
  v_no integer;
  v_draft public.ref_table_versions;
begin
  for v_b in select id, link_column from public.ref_tables where link_table_id = p_source order by name collate "C" loop
    select (c.ord - 1)::integer into v_i from jsonb_array_elements(p_columns) with ordinality as c(col, ord) where c.col ->> 'name' = v_b.link_column limit 1;
    if v_i is null then continue; end if;
    v_no := public.ref_link_add_values(
      v_b.id,
      public.ref_link_distinct(coalesce((select jsonb_agg(r.value -> v_i) from jsonb_array_elements(p_rows) r), '[]'::jsonb)),
      p_valid_from, p_source);
    if v_no is not null then
      select * into v_draft from public.ref_table_versions where ref_table_id = v_b.id and version_no = v_no;
      perform public.ref_link_feed(v_b.id, v_draft.columns, v_draft.rows, v_draft.valid_from);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Link and unlink.

create function public.link_ref_table(p_ref_table_id uuid, p_source_id uuid, p_column text, p_key_column text) returns void
language plpgsql set search_path = '' as $$
declare
  v_b public.ref_tables;
  v_a public.ref_tables;
  v_cycle text;
  v_a_columns jsonb;
  v_b_columns jsonb;
  v_key text := btrim(coalesce(p_key_column, ''));
  v_key_type text;
  v_no integer;
  v_ver public.ref_table_versions;
  v_i integer;
  v_draft public.ref_table_versions;
  v_new integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can link reference tables. Ask the admin.' using errcode = 'P0002';
  end if;
  select * into v_b from public.ref_tables where id = p_ref_table_id;
  if not found then
    raise exception 'This reference table does not exist. Go back to the Reference tables list.' using errcode = 'P0002';
  end if;
  select * into v_a from public.ref_tables where id = p_source_id;
  if not found then
    raise exception 'The table to take the values from does not exist any more. Choose another table.' using errcode = 'P0002';
  end if;
  if v_a.id = v_b.id then
    raise exception 'The table "%" cannot take its values from itself. Choose another table.', v_b.name using errcode = '22023';
  end if;
  v_cycle := public.ref_link_cycle(v_b.id, v_a.id);
  if v_cycle is not null then
    raise exception 'This link would make a cycle: %. Choose another table, or unlink one of these tables first.', v_cycle using errcode = 'P0001';
  end if;
  select columns into v_a_columns from public.ref_table_versions where ref_table_id = v_a.id order by version_no desc limit 1;
  if not exists (select 1 from jsonb_array_elements(coalesce(v_a_columns, '[]'::jsonb)) c where c ->> 'name' = p_column) then
    raise exception 'The table "%" has no column "%". Choose a column of that table.', v_a.name, p_column using errcode = '22023';
  end if;
  if v_b.link_table_id is not null then
    raise exception 'The table "%" takes its values from another table already. Unlink it first, then link it again.', v_b.name using errcode = 'P0001';
  end if;
  if v_key = '' then
    raise exception 'The key column of "%" has no name. Type the name of the column that holds the values.', v_b.name using errcode = '22023';
  end if;
  select columns into v_b_columns from public.ref_table_versions where ref_table_id = v_b.id order by version_no desc limit 1;
  select c ->> 'type' into v_key_type from jsonb_array_elements(coalesce(v_b_columns, '[]'::jsonb)) c where c ->> 'name' = v_key limit 1;
  if v_key_type is not null and v_key_type <> 'text' then
    raise exception 'The column "%" of "%" is not a text column. Choose a text column, or type a new name.', v_key, v_b.name using errcode = '22023';
  end if;

  update public.ref_tables set link_table_id = v_a.id, link_column = p_column, key_column = v_key where id = v_b.id;
  -- B gets a draft with the values of the version of A that is in effect today.
  v_no := public.ref_link_version_in_effect(v_a.id, current_date);
  if v_no is not null then
    select * into v_ver from public.ref_table_versions where ref_table_id = v_a.id and version_no = v_no;
    select (c.ord - 1)::integer into v_i from jsonb_array_elements(v_ver.columns) with ordinality as c(col, ord) where c.col ->> 'name' = p_column limit 1;
    if v_i is not null then
      v_new := public.ref_link_add_values(v_b.id, public.ref_link_distinct(coalesce((select jsonb_agg(r.value -> v_i) from jsonb_array_elements(v_ver.rows) r), '[]'::jsonb)), current_date, v_a.id);
      if v_new is not null then
        select * into v_draft from public.ref_table_versions where ref_table_id = v_b.id and version_no = v_new;
        perform public.ref_link_feed(v_b.id, v_draft.columns, v_draft.rows, v_draft.valid_from);
      end if;
    end if;
  end if;
end $$;

create function public.unlink_ref_table(p_ref_table_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_b public.ref_tables;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can link reference tables. Ask the admin.' using errcode = 'P0002';
  end if;
  select * into v_b from public.ref_tables where id = p_ref_table_id;
  if not found then
    raise exception 'This reference table does not exist. Go back to the Reference tables list.' using errcode = 'P0002';
  end if;
  if v_b.link_table_id is null then
    raise exception 'This table is not linked to another table. Reload the page.' using errcode = '22023';
  end if;
  update public.ref_tables set link_table_id = null, link_column = null, key_column = null where id = p_ref_table_id;
  update public.ref_table_link_events set closed_at = now() where ref_table_id = p_ref_table_id and closed_at is null;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Publish (SPEC 16.2 item 3 and 5): the refusal, the publish as before, the cascade and the closing of the notice, in one call.

create or replace function public.publish_ref_table_version(p_ref_table_id uuid, p_version_no integer) returns void
language plpgsql set search_path = '' as $$
declare
  v public.ref_table_versions;
  v_name text;
  v_tables text;
  v_columns text;
begin
  select * into v from public.ref_table_versions
   where ref_table_id = p_ref_table_id and version_no = p_version_no for update;
  if not found then
    raise exception 'Version % of this reference table does not exist, or you may not change it.', p_version_no using errcode = 'P0002';
  end if;
  if v.status = 'published' then
    raise exception 'Version % is already published.', p_version_no;
  end if;

  -- A version of A without a linked column is refused and names the linked tables.
  select string_agg(b.name, ', ' order by b.name collate "C"), string_agg(distinct b.link_column collate "C", ', ' order by b.link_column collate "C")
    into v_tables, v_columns
  from public.ref_tables b
  where b.link_table_id = p_ref_table_id
    and not exists (select 1 from jsonb_array_elements(v.columns) c where c ->> 'name' = b.link_column);
  if v_tables is not null then
    select name into v_name from public.ref_tables where id = p_ref_table_id;
    raise exception 'This version of "%" has no column "%", which % take their values from. Add the column back, or unlink those tables first.', v_name, v_columns, v_tables using errcode = 'P0001';
  end if;

  perform set_config('app.closing_version', 'on', true);
  update public.ref_table_versions
     set valid_to = v.valid_from - 1
   where ref_table_id = p_ref_table_id and status = 'published' and valid_to is null
     and valid_from < v.valid_from;
  perform set_config('app.closing_version', 'off', true);

  update public.ref_table_versions set status = 'published'
   where ref_table_id = p_ref_table_id and version_no = p_version_no;

  -- The tables linked to this one take the new values into their drafts. A failure here undoes the publish too: one transaction.
  perform public.ref_link_feed(p_ref_table_id, v.columns, v.rows, v.valid_from);
  -- The notice of this table closes when the draft that holds the values is published.
  update public.ref_table_link_events set closed_at = now()
   where ref_table_id = p_ref_table_id and closed_at is null and draft_version_no = p_version_no;
end $$;

create or replace function public.delete_ref_table(p_ref_table_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_name text;
  v_flows text;
  v_linked text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete a reference table. Ask the admin.' using errcode = 'P0002';
  end if;
  select name into v_name from public.ref_tables where id = p_ref_table_id;
  if not found then
    raise exception 'This reference table does not exist. Go back to the Reference tables list.' using errcode = 'P0002';
  end if;
  -- A table that feeds other tables is refused, and the message names them (unlink first).
  select string_agg(b.name, ', ' order by b.name collate "C") into v_linked from public.ref_tables b where b.link_table_id = p_ref_table_id;
  if v_linked is not null then
    raise exception 'The table "%" gives its values to %. Unlink those tables first, then delete it.', v_name, v_linked using errcode = 'P0001';
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

-- Grants: no function is callable by anon. The two that the app calls and the helpers that they call are for signed-in users: the functions are
-- security invoker, so the policies of migration 4 (admin writes) still decide what a caller may change.
revoke execute on function
  public.link_ref_table(uuid, uuid, text, text), public.unlink_ref_table(uuid),
  public.ref_link_distinct(jsonb), public.ref_link_new_values(jsonb, jsonb), public.ref_link_draft_start(date, boolean, date, date, date),
  public.ref_link_version_in_effect(uuid, date), public.ref_link_cycle(uuid, uuid), public.ref_link_keys(uuid),
  public.ref_link_add_values(uuid, jsonb, date, uuid), public.ref_link_feed(uuid, jsonb, jsonb, date)
  from public, anon;
grant execute on function public.link_ref_table(uuid, uuid, text, text), public.unlink_ref_table(uuid) to authenticated;
grant execute on function
  public.ref_link_distinct(jsonb), public.ref_link_new_values(jsonb, jsonb), public.ref_link_draft_start(date, boolean, date, date, date),
  public.ref_link_version_in_effect(uuid, date), public.ref_link_cycle(uuid, uuid), public.ref_link_keys(uuid),
  public.ref_link_add_values(uuid, jsonb, date, uuid), public.ref_link_feed(uuid, jsonb, jsonb, date)
  to authenticated;
revoke execute on function public.publish_ref_table_version(uuid, integer), public.delete_ref_table(uuid) from public, anon;
grant execute on function public.publish_ref_table_version(uuid, integer), public.delete_ref_table(uuid) to authenticated, service_role;
