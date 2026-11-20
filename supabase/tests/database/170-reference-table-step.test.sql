-- T6.9: migration 18. A Reference table step reads its table: ref_table_names, flow_ref_tables, and who reads the rows.
begin;
select * from no_plan();

create function public.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, instance_id, aud, role, email)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email
from (values
  ('00000000-0000-0000-0000-00000000000a'::uuid, 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'member@example.test'),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'other@example.test'),
  ('00000000-0000-0000-0000-0000000000a4'::uuid, 'locked@example.test')) as u(id, email);
insert into public.profiles (id, name, email, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', 'Owner', 'owner@example.test', 'user'),
  ('00000000-0000-0000-0000-0000000000a2', 'Member', 'member@example.test', 'user'),
  ('00000000-0000-0000-0000-0000000000a3', 'Other', 'other@example.test', 'user'),
  ('00000000-0000-0000-0000-0000000000a4', 'Locked', 'locked@example.test', 'user')
  on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role;
update public.profiles set locked_at = now() where id = '00000000-0000-0000-0000-0000000000a4';
insert into public.groups (id, name) values ('30000000-0000-0000-0000-000000000001', 'G');
insert into public.group_members (group_id, user_id) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4');


-- ref_table_names: the list of cases in supabase/tests/ref-table-names-cases.json (src/engine/ref-table-names-cases.test.ts
-- checks that every case is here, and that referencedTables() of the engine gives the same answer for it)
select is(public.ref_table_names('{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"Limits"}}}]}'), array['Limits'], 'a Lookup step with a reference source reads its table');
select is(public.ref_table_names('{"nodes":[{"type":"pivot","settings":{"columns":{"from":"reference","table":"Codes"}}}]}'), array['Codes'], 'a Pivot step with a reference column list reads its table');
select is(public.ref_table_names('{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"node"}}}]}'), '{}'::text[], 'a Lookup step with another step as source reads none');
select is(public.ref_table_names('{"nodes":[{"type":"pivot","settings":{"columns":{"from":"data"}}}]}'), '{}'::text[], 'a Pivot step with a column list from the data reads none');
select is(public.ref_table_names('{"nodes":[{"type":"filter","settings":{"source":{"kind":"reference","table":"Limits"}}}]}'), '{}'::text[], 'another step type with a reference source reads none');
select is(public.ref_table_names('{}'), '{}'::text[], 'a definition with no nodes reads none');
select is(public.ref_table_names('{"nodes":"x"}'), '{}'::text[], 'nodes that are not a list read none');
select is(public.ref_table_names('[1,2]'), '{}'::text[], 'a definition that is not an object reads none');
select is(public.ref_table_names('{"nodes":[1,"a",null,{"type":"lookup_join"},{"type":"lookup_join","settings":{"source":{"kind":"reference","table":5}}}]}'), '{}'::text[], 'odd nodes and a table name that is not text read none');
select is(public.ref_table_names('{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"B"}}},{"type":"pivot","settings":{"columns":{"from":"reference","table":"A"}}},{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"B"}}}]}'), array['A','B'], 'each table once, in order');
select is(public.ref_table_names('{"nodes":[{"type":"reference_table","settings":{"table":"Limits"}}]}'), array['Limits'], 'a Reference table step reads its table');
select is(public.ref_table_names('{"nodes":[{"type":"reference_table","settings":{"table":"Limits"}},{"type":"reference_table","settings":{"table":"Limits"}}]}'), array['Limits'], 'two Reference table steps with one table read it once');
select is(public.ref_table_names('{"nodes":[{"type":"reference_table","settings":{"table":"Limits"}},{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"Limits"}}}]}'), array['Limits'], 'a Reference table step and a Lookup with the same table read it once');
select is(public.ref_table_names('{"nodes":[{"type":"reference_table","settings":{"table":"C"}},{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"B"}}},{"type":"pivot","settings":{"columns":{"from":"reference","table":"A"}}}]}'), array['A','B','C'], 'a Reference table step, a Lookup and a Pivot, each table once, in order');
select is(public.ref_table_names('{"nodes":[{"type":"reference_table","settings":{}}]}'), '{}'::text[], 'a Reference table step with no table reads none');
select is(public.ref_table_names('{"nodes":[{"type":"reference_table"}]}'), '{}'::text[], 'a Reference table step with no settings reads none');
select is(public.ref_table_names('{"nodes":[{"type":"reference_table","settings":{"table":5}},{"type":"reference_table","settings":{"table":null}}]}'), '{}'::text[], 'a Reference table step whose table is not text reads none');
select is(public.ref_table_names('{"nodes":[{"type":"filter","settings":{"table":"Limits"}}]}'), '{}'::text[], 'another step type with a table setting reads none');

-- Four tables: OnlyStep (read by a flow only through the step), Both (the step and a Lookup of one flow),
-- LookupOnly (a Lookup of another flow) and Unused (no flow).
insert into public.ref_tables (id, name, description) values
  ('20000000-0000-0000-0000-000000000001', 'OnlyStep', 'd1'),
  ('20000000-0000-0000-0000-000000000002', 'Both', 'd2'),
  ('20000000-0000-0000-0000-000000000003', 'LookupOnly', 'd3'),
  ('20000000-0000-0000-0000-000000000004', 'Unused', 'd4');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status, columns, rows) values
  ('20000000-0000-0000-0000-000000000001', 1, '2026-01-01', null, 'published', '[]', '[[1]]'),
  ('20000000-0000-0000-0000-000000000002', 1, '2026-01-01', null, 'published', '[]', '[[2]]'),
  ('20000000-0000-0000-0000-000000000003', 1, '2026-01-01', null, 'published', '[]', '[[3]]'),
  ('20000000-0000-0000-0000-000000000004', 1, '2026-01-01', null, 'published', '[]', '[[4]]');
insert into public.flows (id, name, owner_id, scope) values
  ('10000000-0000-0000-0000-0000000000f1', 'Step only', '00000000-0000-0000-0000-0000000000a1', 'personal'),
  ('10000000-0000-0000-0000-0000000000f2', 'Step and Lookup', '00000000-0000-0000-0000-00000000000a', 'shared'),
  ('10000000-0000-0000-0000-0000000000f3', 'Lookup only', '00000000-0000-0000-0000-0000000000a3', 'personal');
insert into public.flow_group_access (flow_id, group_id) values ('10000000-0000-0000-0000-0000000000f2', '30000000-0000-0000-0000-000000000001');
insert into public.flow_versions (flow_id, version_no, valid_from, status, definition) values
  ('10000000-0000-0000-0000-0000000000f1', 1, '2026-01-01', 'draft', '{"nodes":[{"type":"reference_table","settings":{"table":"OnlyStep"}}]}'),
  ('10000000-0000-0000-0000-0000000000f2', 1, '2026-01-01', 'published', '{"nodes":[{"type":"reference_table","settings":{"table":"Both"}},{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"Both"}}}]}'),
  ('10000000-0000-0000-0000-0000000000f3', 1, '2026-01-01', 'draft', '{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"LookupOnly"}}}]}');

-- the rows of flow_ref_tables, filled by the trigger
select is((select array_agg(ref_table_name) from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f1'), array['OnlyStep'], 'a flow that reads a table only through the step has its row');
select is((select array_agg(ref_table_name) from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f2'), array['Both'], 'the step and a Lookup of one table give one row');
select is((select array_agg(ref_table_name) from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f3'), array['LookupOnly'], 'a flow with a Lookup only keeps its row');

-- the owner of the flow that uses the step only: its table, and nothing else
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select array_agg(ref_table_id) from public.ref_table_versions), array['20000000-0000-0000-0000-000000000001'::uuid], 'a person with a flow that has the step reads the rows of its table, and no other');
select ok(public.can_read_ref_table('20000000-0000-0000-0000-000000000001'), 'the helper says yes for the table of the step');
select ok(not public.can_read_ref_table('20000000-0000-0000-0000-000000000004'), 'and no for a table that no flow reads');
select is((select count(*)::int from public.ref_tables), 4, 'every name stays visible');
reset role;

-- a member of the group: the table that the shared flow reads through the step and a Lookup
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select array_agg(ref_table_id) from public.ref_table_versions), array['20000000-0000-0000-0000-000000000002'::uuid], 'a member of the group reads the table of the shared flow');
reset role;

-- a person with a Lookup only: that table
select public.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select array_agg(ref_table_id) from public.ref_table_versions), array['20000000-0000-0000-0000-000000000003'::uuid], 'a person with a Lookup only reads that table, and not the table of the step of another flow');
reset role;

-- a locked user, also as a member of the group
select public.act_as('00000000-0000-0000-0000-0000000000a4');
select is((select count(*)::int from public.ref_table_versions), 0, 'a locked user reads no rows');
reset role;

-- a deleted flow gives no access, and restore gives it back
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.delete_flow('10000000-0000-0000-0000-0000000000f1')$$, 'the owner deletes the flow');
select is((select count(*)::int from public.ref_table_versions), 0, 'a deleted flow gives no access through the step');
reset role;
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.restore_flow('10000000-0000-0000-0000-0000000000f1')$$, 'the admin restores it (only an admin can)');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.ref_table_versions), 1, 'the access is back after the restore');
reset role;

-- an edit that removes the step takes the access away, and an edit that adds it gives it back
update public.flow_versions set definition = '{"nodes":[]}' where flow_id = '10000000-0000-0000-0000-0000000000f1';
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.ref_table_versions), 0, 'a flow that no longer has the step gives no access to its table');
reset role;
update public.flow_versions set definition = '{"nodes":[{"type":"reference_table","settings":{"table":"OnlyStep"}}]}' where flow_id = '10000000-0000-0000-0000-0000000000f1';
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.ref_table_versions), 1, 'adding the step gives the access back');
reset role;

-- the backfill: empty flow_ref_tables, rebuild, and the step is found again
delete from public.flow_ref_tables;
select public.rebuild_flow_ref_tables();
select is((select count(*)::int from public.flow_ref_tables), 3, 'the backfill refills one row for each of the three flows');
select is((select array_agg(ref_table_name) from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f1'), array['OnlyStep'], 'including the table of the step');

-- migration 18 adds no function: the two that exist stay closed
select ok(not has_function_privilege('authenticated', 'public.rebuild_flow_ref_tables()', 'execute'), 'the backfill function is not callable');
select ok(not has_function_privilege('authenticated', 'public.sync_flow_ref_tables()', 'execute'), 'the trigger function is not callable');

select * from finish();
