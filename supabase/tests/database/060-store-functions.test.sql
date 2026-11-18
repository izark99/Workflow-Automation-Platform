-- T3.6b1: server functions behind the write side of SupabaseStore, and the last-admin rule.
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
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'member@example.test')) as u(id, email);
insert into public.profiles (id, name, email, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', 'Owner', 'owner@example.test', 'user'),
  ('00000000-0000-0000-0000-0000000000a2', 'Member', 'member@example.test', 'user');
insert into public.groups (id, name) values
  ('30000000-0000-0000-0000-000000000001', 'Group G'),
  ('30000000-0000-0000-0000-000000000002', 'Group H');
insert into public.group_members (group_id, user_id) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2');
insert into public.flows (id, name, owner_id, scope) values
  ('10000000-0000-0000-0000-0000000000f2', 'Shared flow', '00000000-0000-0000-0000-00000000000a', 'shared'),
  ('10000000-0000-0000-0000-0000000000f9', 'Hidden flow', '00000000-0000-0000-0000-00000000000a', 'personal');
insert into public.flow_group_access (flow_id, group_id) values
  ('10000000-0000-0000-0000-0000000000f2', '30000000-0000-0000-0000-000000000001');
insert into public.flow_versions (flow_id, version_no, valid_from, status, definition, change_note) values
  ('10000000-0000-0000-0000-0000000000f2', 1, '2026-01-01', 'published', '{"nodes":[1]}', 'v1'),
  ('10000000-0000-0000-0000-0000000000f2', 2, '2026-07-01', 'draft', '{"nodes":[2]}', 'v2');
insert into public.ref_tables (id, name) values ('20000000-0000-0000-0000-000000000001', 'Limits');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values
  ('20000000-0000-0000-0000-000000000001', 1, '2026-01-01', 'published', '[{"name":"A","type":"text"}]', '[["x"],["y"]]');

-- create_flow
select public.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table made (k text primary key, id uuid) on commit drop;
grant all on made to authenticated;
insert into made values ('own', public.create_flow('  Own flow  '));
select is((select name from public.flows where id = (select id from made where k = 'own')), 'Own flow', 'create_flow trims the name');
select is((select owner_id from public.flows where id = (select id from made where k = 'own')),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'the caller owns the new flow');
select is((select scope from public.flows where id = (select id from made where k = 'own')), 'personal', 'the new flow is personal');
select results_eq($$select version_no, status, valid_from = current_date, change_note, definition::text
    from public.flow_versions where flow_id = (select id from made where k = 'own')$$,
  $$values (1, 'draft', true, 'First version', '{"edges": [], "nodes": [], "schemaVersion": 1}')$$,
  'the new flow has one empty draft version that starts today');
select throws_ok($$select public.create_flow('Shared by owner', 'shared')$$, '42501', null, 'a user cannot create a shared flow');
select throws_ok($$select public.create_flow('   ')$$, '22023', null, 'a flow needs a name');
select throws_ok($$select public.create_flow('X', 'public')$$, '22023', null, 'the scope must be personal or shared');
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.create_flow('Admin shared', 'shared')$$, 'admin creates a shared flow');

-- copy_flow
select public.act_as('00000000-0000-0000-0000-0000000000a2');
insert into made values ('copy', public.copy_flow('10000000-0000-0000-0000-0000000000f2', ''));
select is((select name from public.flows where id = (select id from made where k = 'copy')), 'Shared flow (copy)', 'the copy gets a default name');
select is((select scope || ':' || owner_id::text from public.flows where id = (select id from made where k = 'copy')),
  'personal:00000000-0000-0000-0000-0000000000a2', 'the copy is personal and owned by the caller');
select results_eq($$select version_no, status, valid_from::text, change_note, definition::text
    from public.flow_versions where flow_id = (select id from made where k = 'copy')$$,
  $$values (1, 'draft', '2026-07-01', 'Copied from Shared flow', '{"nodes": [2]}')$$,
  'the copy has one draft with the latest definition');
insert into made values ('copy2', public.copy_flow('10000000-0000-0000-0000-0000000000f2', ' My copy '));
select is((select name from public.flows where id = (select id from made where k = 'copy2')), 'My copy', 'a given name is used');
select lives_ok($$update public.flow_versions set definition = '{"edited":true}'
  where flow_id = (select id from made where k = 'copy') and version_no = 1$$, 'the caller edits the copy');
select throws_ok($$select public.copy_flow('10000000-0000-0000-0000-0000000000f9', '')$$, 'P0002', null,
  'a flow the caller cannot see cannot be copied');

-- create_flow_version
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is(public.create_flow_version((select id from made where k = 'own'), '2026-12-01', null, 'next'), 2, 'the next number is 2');
select is(public.create_flow_version((select id from made where k = 'own'), '2027-01-01', 1), 3, 'then 3');
select is((select definition::text from public.flow_versions where flow_id = (select id from made where k = 'own') and version_no = 3),
  '{"edges": [], "nodes": [], "schemaVersion": 1}', 'a version copied from v1 has its definition');
select is((select change_note || '/' || status from public.flow_versions where flow_id = (select id from made where k = 'own') and version_no = 2),
  'next/draft', 'the note and the draft status are kept');
select throws_ok($$select public.create_flow_version((select id from made where k = 'own'), '2027-02-01', 9)$$, 'P0002', null,
  'copying from a missing version is refused');
select throws_ok($$select public.create_flow_version('10000000-0000-0000-0000-0000000000f2', '2027-02-01')$$, 'P0002', null,
  'a user cannot add a version to a flow they cannot change');
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.create_flow_version('10000000-0000-0000-0000-0000000000f2', '2027-02-01', 1)$$, 'P0002', null,
  'a member cannot add a version to a shared flow');
select public.act_as('00000000-0000-0000-0000-00000000000a');
select is(public.create_flow_version('10000000-0000-0000-0000-0000000000f2', '2027-02-01', 2), 3, 'admin adds v3 to a shared flow');

-- create_ref_table and create_ref_table_version
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.create_ref_table('Mine', '', '[]')$$, '42501', null, 'a user cannot create a reference table');
select public.act_as('00000000-0000-0000-0000-00000000000a');
insert into made values ('ref', public.create_ref_table(' Codes ', 'Pay codes', '[{"name":"CODE","type":"text"}]'));
select results_eq($$select t.name, t.description, v.version_no, v.status, v.valid_from = current_date, v.columns::text, v.rows::text
    from public.ref_tables t join public.ref_table_versions v on v.ref_table_id = t.id
    where t.id = (select id from made where k = 'ref')$$,
  $$values ('Codes', 'Pay codes', 1, 'draft', true, '[{"name": "CODE", "type": "text"}]', '[]')$$,
  'a new reference table has one empty draft version');
select throws_ok($$select public.create_ref_table('codes', '', '[]')$$, 'P0001', null, 'a name that exists is refused, ignoring case');
select throws_ok($$select public.create_ref_table(' ', '', '[]')$$, '22023', null, 'a reference table needs a name');
select is(public.create_ref_table_version('20000000-0000-0000-0000-000000000001', '2026-07-01', 1), 2, 'a new version of a reference table');
select results_eq($$select columns::text, rows::text, status from public.ref_table_versions
    where ref_table_id = '20000000-0000-0000-0000-000000000001' and version_no = 2$$,
  $$values ('[{"name": "A", "type": "text"}]', '[["x"], ["y"]]', 'draft')$$, 'it copies columns and rows');
select is(public.create_ref_table_version('20000000-0000-0000-0000-000000000001', '2026-09-01'), 3, 'an empty version has the next number');
select throws_ok($$select public.create_ref_table_version('20000000-0000-0000-0000-000000000001', '2026-09-01', 9)$$, 'P0002', null,
  'copying from a missing version is refused');
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.create_ref_table_version('20000000-0000-0000-0000-000000000001', '2027-01-01')$$, 'P0002', null,
  'a user cannot add a reference table version');

-- set_flow_groups
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.set_flow_groups('10000000-0000-0000-0000-0000000000f2',
  array['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002']::uuid[])$$, 'admin sets two groups');
select is((select count(*)::int from public.flow_group_access where flow_id = '10000000-0000-0000-0000-0000000000f2'), 2, 'both are saved');
select lives_ok($$select public.set_flow_groups('10000000-0000-0000-0000-0000000000f2',
  array['30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002']::uuid[])$$, 'admin replaces the groups (a repeated id is fine)');
select is((select string_agg(group_id::text, ',') from public.flow_group_access where flow_id = '10000000-0000-0000-0000-0000000000f2'),
  '30000000-0000-0000-0000-000000000002', 'only the new group is left');
select lives_ok($$select public.set_flow_groups('10000000-0000-0000-0000-0000000000f2', array[]::uuid[])$$, 'admin removes all groups');
select throws_ok($$select public.set_flow_groups('10000000-0000-0000-0000-0000000000ff', array[]::uuid[])$$, 'P0002', null,
  'a flow the admin cannot find is refused');
select throws_ok($$select public.set_flow_groups('10000000-0000-0000-0000-0000000000f9', array[]::uuid[])$$, '22023', null,
  'only a shared flow has group access');
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.set_flow_groups('10000000-0000-0000-0000-0000000000f2',
  array['30000000-0000-0000-0000-000000000001']::uuid[])$$, '42501', null, 'a member cannot change group access');
select throws_ok($$select public.set_flow_groups('10000000-0000-0000-0000-0000000000f2', array[]::uuid[])$$, '42501', null,
  'a member cannot clear group access either');

-- set_user_groups
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.set_user_groups('00000000-0000-0000-0000-0000000000a1',
  array['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002']::uuid[])$$, 'admin sets the groups of a user');
select is((select count(*)::int from public.group_members where user_id = '00000000-0000-0000-0000-0000000000a1'), 2, 'both memberships are saved');
select lives_ok($$select public.set_user_groups('00000000-0000-0000-0000-0000000000a1', array[]::uuid[])$$, 'admin clears them');
select is((select count(*)::int from public.group_members where user_id = '00000000-0000-0000-0000-0000000000a1'), 0, 'none is left');
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.set_user_groups('00000000-0000-0000-0000-0000000000a2',
  array['30000000-0000-0000-0000-000000000002']::uuid[])$$, '42501', null, 'a member cannot add themselves to a group');

-- The last admin cannot be demoted or removed
reset role;
select throws_ok($$update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-00000000000a'$$,
  'P0001', null, 'the only admin cannot be made a user');
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-00000000000a'$$,
  'P0001', null, 'the only admin cannot be removed');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
select lives_ok($$update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-00000000000a'$$,
  'an admin can be demoted when another admin exists');
select throws_ok($$update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'P0001', null, 'and then the other one is the last admin');

select * from finish();
rollback;
