-- T5.18: the rows of a reference table are read by the admin and by a person who may view a flow that reads the table.
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

-- Three tables: Own (read by the owner's personal flow), Shared (read by a shared flow of the group), Unused (read by no flow)
insert into public.ref_tables (id, name, description) values
  ('20000000-0000-0000-0000-000000000001', 'Own', 'd1'),
  ('20000000-0000-0000-0000-000000000002', 'Shared', 'd2'),
  ('20000000-0000-0000-0000-000000000003', 'Unused', 'd3');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status, columns, rows) values
  ('20000000-0000-0000-0000-000000000001', 1, '2026-01-01', null, 'published', '[]', '[[1]]'),
  ('20000000-0000-0000-0000-000000000001', 2, '2027-01-01', null, 'draft', '[]', '[[2]]'),
  ('20000000-0000-0000-0000-000000000002', 1, '2026-01-01', null, 'published', '[]', '[[3]]'),
  ('20000000-0000-0000-0000-000000000003', 1, '2026-01-01', null, 'published', '[]', '[[4]]');
insert into public.flows (id, name, owner_id, scope) values
  ('10000000-0000-0000-0000-0000000000f1', 'Personal', '00000000-0000-0000-0000-0000000000a1', 'personal'),
  ('10000000-0000-0000-0000-0000000000f2', 'Shared', '00000000-0000-0000-0000-00000000000a', 'shared');
insert into public.flow_group_access (flow_id, group_id) values ('10000000-0000-0000-0000-0000000000f2', '30000000-0000-0000-0000-000000000001');
-- The personal flow reads Own in a draft version only; the shared flow reads Shared in a published version.
insert into public.flow_versions (flow_id, version_no, valid_from, status, definition) values
  ('10000000-0000-0000-0000-0000000000f1', 1, '2026-01-01', 'draft', '{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"Own"}}}]}'),
  ('10000000-0000-0000-0000-0000000000f2', 1, '2026-01-01', 'published', '{"nodes":[{"type":"pivot","settings":{"columns":{"from":"reference","table":"Shared"}}}]}');

-- the helper is for signed-in users only
set local role anon;
select throws_ok($$select public.can_read_ref_table('20000000-0000-0000-0000-000000000001')$$, '42501', null, 'a visitor cannot call the helper');
select throws_ok($$select * from public.ref_table_versions$$, '42501', null, 'and reads no version');
reset role;

-- admin: every version of every table
select public.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.ref_table_versions), 4, 'the admin reads every version');
select is((select count(*)::int from public.ref_tables), 3, 'and every table');
reset role;

-- the owner of the personal flow: Own, both versions (a draft counts), nothing else; every table name and description
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.ref_tables), 3, 'the owner sees the name of every table');
select is((select array_agg(description order by name) from public.ref_tables), array['d1','d2','d3'], 'and every description');
select is((select array_agg(version_no order by version_no) from public.ref_table_versions where ref_table_id = '20000000-0000-0000-0000-000000000001'), array[1,2], 'the owner reads the published and the draft version of the table that the own flow reads');
select is((select count(*)::int from public.ref_table_versions where ref_table_id <> '20000000-0000-0000-0000-000000000001'), 0, 'and no version of another table');
select is((select count(*)::int from public.ref_table_versions), 2, 'two versions in all');
select ok(public.can_read_ref_table('20000000-0000-0000-0000-000000000001'), 'the helper says yes for Own');
select ok(not public.can_read_ref_table('20000000-0000-0000-0000-000000000002'), 'and no for Shared');
reset role;

-- a member of the group: the table of the shared flow
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select array_agg(ref_table_id) from public.ref_table_versions), array['20000000-0000-0000-0000-000000000002'::uuid], 'a member reads the table of the shared flow, and nothing else');
select is((select count(*)::int from public.ref_tables), 3, 'and still sees every name');
reset role;

-- a user with no flow that uses any table
select public.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.ref_table_versions), 0, 'a user with no flow reads no rows');
select is((select count(*)::int from public.ref_tables), 3, 'but sees every name');
select is((select count(*)::int from (select rows from public.ref_table_versions) x), 0, 'no path returns the rows');
select is((select count(*)::int from public.ref_tables t join public.ref_table_versions v on v.ref_table_id = t.id), 0, 'also through a join');
reset role;

-- a locked user, also as a member of the group
select public.act_as('00000000-0000-0000-0000-0000000000a4');
select is((select count(*)::int from public.ref_table_versions), 0, 'a locked user reads no rows');
select is((select count(*)::int from public.ref_tables), 0, 'and no names');
reset role;

-- writes stay with the admin
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$insert into public.ref_table_versions (ref_table_id, version_no, valid_from) values ('20000000-0000-0000-0000-000000000001', 3, '2028-01-01')$$, '42501', null, 'a user cannot add a version, also of a table they read');
with u as (update public.ref_table_versions set rows = '[[9]]' where version_no = 2 returning 1) select is((select count(*)::int from u), 0, 'or change one');
reset role;

-- a deleted flow no longer gives access, and restore gives it back
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$select 1$$, 'the member of the group, before the shared flow is deleted');
reset role;
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.delete_flow('10000000-0000-0000-0000-0000000000f2')$$, 'the admin deletes the shared flow');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.ref_table_versions), 0, 'a deleted flow no longer gives access to its table');
reset role;
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.restore_flow('10000000-0000-0000-0000-0000000000f2')$$, 'the admin restores it');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.ref_table_versions), 1, 'and the member reads the table again');
reset role;

-- editing the definition changes the access: the owner stops reading Own when the step goes
update public.flow_versions set definition = '{"nodes":[]}' where flow_id = '10000000-0000-0000-0000-0000000000f1';
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.ref_table_versions), 0, 'a flow that no longer reads the table gives no access to it');
reset role;

select * from finish();
