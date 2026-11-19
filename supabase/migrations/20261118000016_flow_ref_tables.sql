-- T5.17: which reference tables a version of a flow reads (SPEC 12.1, "Rules for the server").
-- `flow_ref_tables` is kept by a trigger on `flow_versions`, so the database can tell who may read the rows of a table
-- (migration 17) without the browser saying so. A version reads a table when it has
--   a Lookup step (type lookup_join) whose settings.source is {"kind": "reference", "table": "<name>"}, or
--   a Pivot step whose settings.columns is {"from": "reference", "table": "<name>"}.
-- This is the rule of `referencedTables()` in src/engine/versions.ts, which the run uses; a test keeps the two together.

-- The table names that a definition reads, each once. Anything that is not the expected shape reads no table.
create function public.ref_table_names(p_definition jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct s.name order by s.name), '{}'::text[])
  from (
    select src ->> 'table' as name
    from (
      select case n ->> 'type'
               when 'lookup_join' then n -> 'settings' -> 'source'
               when 'pivot' then n -> 'settings' -> 'columns'
             end as src
      from jsonb_array_elements(case when jsonb_typeof(p_definition -> 'nodes') = 'array' then p_definition -> 'nodes' else '[]'::jsonb end) as n
    ) x
    where jsonb_typeof(src) = 'object'
      and (src ->> 'kind' = 'reference' or src ->> 'from' = 'reference')
      and jsonb_typeof(src -> 'table') = 'string'
  ) s;
$$;

create table public.flow_ref_tables (
  flow_id uuid not null,
  version_no integer not null,
  ref_table_name text not null,
  primary key (flow_id, version_no, ref_table_name),
  -- A deleted version (or a flow removed for good) takes its rows with it.
  foreign key (flow_id, version_no) references public.flow_versions (flow_id, version_no) on delete cascade
);
create index flow_ref_tables_name_idx on public.flow_ref_tables (ref_table_name);

alter table public.flow_ref_tables enable row level security;

-- Read through the flow: a person sees the rows of a flow that they may view. A soft-deleted flow is not viewable, so
-- its rows are hidden until it is restored. There is no write policy and no write grant: only the trigger writes.
revoke all on public.flow_ref_tables from anon, authenticated;
grant select on public.flow_ref_tables to authenticated;
create policy flow_ref_tables_read on public.flow_ref_tables for select to authenticated using (public.can_view_flow(flow_id));
create policy flow_ref_tables_active_only on public.flow_ref_tables as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

create function public.sync_flow_ref_tables() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.flow_ref_tables where flow_id = new.flow_id and version_no = new.version_no;
  insert into public.flow_ref_tables (flow_id, version_no, ref_table_name)
  select new.flow_id, new.version_no, name from unnest(public.ref_table_names(new.definition)) as name;
  return null;
end $$;

-- Not callable as a function (D82). A trigger does not need EXECUTE for the role that writes the row.
revoke execute on function public.sync_flow_ref_tables() from public, anon, authenticated;

-- Delete is covered by the foreign key above. Insert and an update of the definition refill the rows of that version.
create trigger flow_versions_ref_tables after insert or update of definition on public.flow_versions
for each row execute function public.sync_flow_ref_tables();

-- Fills the table from every version that exists. The migration runs it once; the tests run it again to prove it.
create function public.rebuild_flow_ref_tables() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.flow_ref_tables;
  insert into public.flow_ref_tables (flow_id, version_no, ref_table_name)
  select v.flow_id, v.version_no, name
  from public.flow_versions v, lateral unnest(public.ref_table_names(v.definition)) as name;
end $$;

revoke execute on function public.rebuild_flow_ref_tables() from public, anon, authenticated;

select public.rebuild_flow_ref_tables();
