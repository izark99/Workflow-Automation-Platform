-- T6.9: a Reference table step reads its table too (SPEC 13.3 item 9). `ref_table_names()` now also lists the table of a step
-- of type reference_table (settings.table, a text), so `flow_ref_tables` and the rule of migration 17 (a person who may run
-- the flow reads the rows of the tables it reads) cover the step. This is the rule of `referencedTables()` in
-- src/engine/versions.ts; `supabase/tests/ref-table-names-cases.json` is the list of cases that both tests use.
-- The trigger of migration 16 already calls this function, so a saved flow is picked up from now on; the backfill runs
-- again for the flows that exist. Nothing new is callable: the function keeps its grants, and no function is added.

create or replace function public.ref_table_names(p_definition jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct s.name order by s.name), '{}'::text[])
  from (
    -- Lookup and Pivot steps: a reference source or a reference column list.
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
    union all
    -- Reference table steps: the table named in the settings.
    select n -> 'settings' ->> 'table' as name
    from jsonb_array_elements(case when jsonb_typeof(p_definition -> 'nodes') = 'array' then p_definition -> 'nodes' else '[]'::jsonb end) as n
    where n ->> 'type' = 'reference_table' and jsonb_typeof(n -> 'settings' -> 'table') = 'string'
  ) s;
$$;

select public.rebuild_flow_ref_tables();
