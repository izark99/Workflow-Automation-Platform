-- T5.17: flow_ref_tables is kept by a trigger on flow_versions and read through can_view_flow.
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

-- ref_table_names: the shapes that read a table
select is(public.ref_table_names('{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"Limits"}}}]}'), array['Limits'], 'a Lookup step with a reference source reads its table');
select is(public.ref_table_names('{"nodes":[{"type":"pivot","settings":{"columns":{"from":"reference","table":"Codes"}}}]}'), array['Codes'], 'a Pivot step with a reference column list reads its table');
select is(public.ref_table_names('{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"node"}}}]}'), '{}'::text[], 'a Lookup step with another step as source reads none');
select is(public.ref_table_names('{"nodes":[{"type":"pivot","settings":{"columns":{"from":"data"}}}]}'), '{}'::text[], 'a Pivot step with a column list from the data reads none');
select is(public.ref_table_names('{"nodes":[{"type":"filter","settings":{"source":{"kind":"reference","table":"Limits"}}}]}'), '{}'::text[], 'another step type reads none');
select is(public.ref_table_names('{}'), '{}'::text[], 'a definition with no nodes reads none');
select is(public.ref_table_names('{"nodes":"x"}'), '{}'::text[], 'nodes that are not a list read none');
select is(public.ref_table_names('[1,2]'), '{}'::text[], 'a definition that is not an object reads none');
select is(public.ref_table_names('{"nodes":[1,"a",null,{"type":"lookup_join"},{"type":"lookup_join","settings":{"source":{"kind":"reference","table":5}}}]}'), '{}'::text[], 'odd nodes and a table name that is not text read none');
select is(public.ref_table_names('{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"B"}}},{"type":"pivot","settings":{"columns":{"from":"reference","table":"A"}}},{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"B"}}}]}'), array['A','B'], 'each table once, in order');

-- flows
insert into public.flows (id, name, owner_id, scope) values
  ('10000000-0000-0000-0000-0000000000f1', 'Personal', '00000000-0000-0000-0000-0000000000a1', 'personal'),
  ('10000000-0000-0000-0000-0000000000f2', 'Shared', '00000000-0000-0000-0000-00000000000a', 'shared');
insert into public.flow_group_access (flow_id, group_id) values ('10000000-0000-0000-0000-0000000000f2', '30000000-0000-0000-0000-000000000001');

-- save: insert fills the rows of the version
insert into public.flow_versions (flow_id, version_no, valid_from, status, definition) values
  ('10000000-0000-0000-0000-0000000000f1', 1, '2026-01-01', 'draft', '{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"Limits"}}}]}'),
  ('10000000-0000-0000-0000-0000000000f2', 1, '2026-01-01', 'published', '{"nodes":[{"type":"pivot","settings":{"columns":{"from":"reference","table":"Codes"}}}]}');
select is((select array_agg(ref_table_name order by ref_table_name) from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f1'), array['Limits'], 'saving a version fills its rows');
select is((select count(*)::int from public.flow_ref_tables), 2, 'one row for each flow so far');

-- edit: the rows follow the definition
update public.flow_versions set definition = '{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"Limits"}}},{"type":"pivot","settings":{"columns":{"from":"reference","table":"Codes"}}}]}'
  where flow_id = '10000000-0000-0000-0000-0000000000f1' and version_no = 1;
select is((select array_agg(ref_table_name order by ref_table_name) from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f1'), array['Codes','Limits'], 'adding a step adds its table');
update public.flow_versions set definition = '{"nodes":[{"type":"pivot","settings":{"columns":{"from":"reference","table":"Codes"}}}]}'
  where flow_id = '10000000-0000-0000-0000-0000000000f1' and version_no = 1;
select is((select array_agg(ref_table_name order by ref_table_name) from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f1'), array['Codes'], 'removing a step removes its table');
update public.flow_versions set change_note = 'only a note' where flow_id = '10000000-0000-0000-0000-0000000000f1' and version_no = 1;
select is((select count(*)::int from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f1'), 1, 'an update that does not touch the definition keeps the rows');
update public.flow_versions set definition = '{"nodes":[]}' where flow_id = '10000000-0000-0000-0000-0000000000f1' and version_no = 1;
select is((select count(*)::int from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f1'), 0, 'a definition with no reference step has no rows');

-- copy a version: the new version has its own rows
update public.flow_versions set definition = '{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"Limits"}}}]}' where flow_id = '10000000-0000-0000-0000-0000000000f1' and version_no = 1;
insert into public.flow_versions (flow_id, version_no, valid_from, status, definition)
  select flow_id, 2, '2027-01-01', 'draft', definition from public.flow_versions where flow_id = '10000000-0000-0000-0000-0000000000f1' and version_no = 1;
select is((select count(*)::int from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f1' and version_no = 2), 1, 'a copied version has its own rows');

-- delete a version: its rows go with it, the other version keeps its rows
delete from public.flow_versions where flow_id = '10000000-0000-0000-0000-0000000000f1' and version_no = 2;
select is((select array_agg(version_no) from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f1'), array[1], 'deleting a version removes its rows only');

-- the backfill: empty the table, then rebuild
delete from public.flow_ref_tables;
select public.rebuild_flow_ref_tables();
select is((select count(*)::int from public.flow_ref_tables), 2, 'the backfill refills every version that exists');

-- who reads the rows
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.flow_ref_tables), 1, 'the owner reads the rows of the own personal flow only');
select is((select ref_table_name from public.flow_ref_tables), 'Limits', 'and they are the right ones');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select array_agg(ref_table_name) from public.flow_ref_tables), array['Codes'], 'a member of the group reads the rows of the shared flow');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.flow_ref_tables), 0, 'a user with no access to a flow reads none of its rows');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000a4');
select is((select count(*)::int from public.flow_ref_tables), 0, 'a locked user reads nothing, also as a member of the group');
reset role;
select public.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.flow_ref_tables), 2, 'the admin reads every row');
reset role;

-- no direct writes
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$insert into public.flow_ref_tables values ('10000000-0000-0000-0000-0000000000f1', 1, 'Fake')$$, '42501', null, 'not even the admin writes the table directly');
select throws_ok($$delete from public.flow_ref_tables$$, '42501', null, 'or deletes from it');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$update public.flow_ref_tables set ref_table_name = 'X'$$, '42501', null, 'a user cannot update it');
reset role;
set local role anon;
select throws_ok($$select * from public.flow_ref_tables$$, '42501', null, 'a visitor reads nothing');
reset role;
select ok(not has_function_privilege('authenticated', 'public.sync_flow_ref_tables()', 'execute'), 'the trigger function is not callable');
select ok(not has_function_privilege('authenticated', 'public.rebuild_flow_ref_tables()', 'execute'), 'the backfill function is not callable either');

-- soft delete hides the rows, restore brings them back, nothing is rebuilt
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.delete_flow('10000000-0000-0000-0000-0000000000f1')$$, 'the owner deletes the flow');
select is((select count(*)::int from public.flow_ref_tables), 0, 'a deleted flow no longer shows its rows');
reset role;
select is((select count(*)::int from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f1'), 1, 'but the rows are still there');
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.restore_flow('10000000-0000-0000-0000-0000000000f1')$$, 'the admin restores the flow');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.flow_ref_tables), 1, 'and the owner reads its rows again');
reset role;

-- a flow removed for good takes its rows
select lives_ok($$update public.flows set deleted_at = now() where id = '10000000-0000-0000-0000-0000000000f1'$$, 'the flow is deleted again');
select lives_ok($$delete from public.flows where id = '10000000-0000-0000-0000-0000000000f1'$$, 'and removed for good');
select is((select count(*)::int from public.flow_ref_tables where flow_id = '10000000-0000-0000-0000-0000000000f1'), 0, 'its rows are gone');

select * from finish();
