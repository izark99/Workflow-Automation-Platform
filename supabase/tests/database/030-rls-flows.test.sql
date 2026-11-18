-- T3.3: row-level security of flows, flow_versions and flow_group_access.
-- Personas: admin, owner (user with a personal flow), group member, other user.
begin;
select * from no_plan();

create function public.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Fixtures, written as the table owner
insert into auth.users (id, instance_id, aud, role, email)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email
from (values
  ('00000000-0000-0000-0000-00000000000a'::uuid, 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'member@example.test'),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'other@example.test')) as u(id, email);
insert into public.profiles (id, name, email, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', 'Owner', 'owner@example.test', 'user'),
  ('00000000-0000-0000-0000-0000000000a2', 'Member', 'member@example.test', 'user'),
  ('00000000-0000-0000-0000-0000000000a3', 'Other', 'other@example.test', 'user')
  on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role;
insert into public.groups (id, name) values
  ('30000000-0000-0000-0000-000000000001', 'Group G'),
  ('30000000-0000-0000-0000-000000000002', 'Group H');
insert into public.group_members (group_id, user_id) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2');
insert into public.flows (id, name, owner_id, scope) values
  ('10000000-0000-0000-0000-0000000000f1', 'Personal flow', '00000000-0000-0000-0000-0000000000a1', 'personal'),
  ('10000000-0000-0000-0000-0000000000f2', 'Shared flow', '00000000-0000-0000-0000-00000000000a', 'shared');
insert into public.flow_group_access (flow_id, group_id) values
  ('10000000-0000-0000-0000-0000000000f2', '30000000-0000-0000-0000-000000000001');
insert into public.flow_versions (flow_id, version_no, valid_from, status, definition) values
  ('10000000-0000-0000-0000-0000000000f1', 1, '2026-01-01', 'published', '{"p":1}'),
  ('10000000-0000-0000-0000-0000000000f2', 1, '2026-01-01', 'published', '{"s":1}'),
  ('10000000-0000-0000-0000-0000000000f2', 2, '2026-07-01', 'draft', '{"s":2}');

-- What each persona can see: flows, versions, group access
select public.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.flows), 2, 'admin sees every flow');
select is((select count(*)::int from public.flow_versions), 3, 'admin sees every version');
select is((select count(*)::int from public.flow_group_access), 1, 'admin sees group access');

select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select string_agg(name, ',') from public.flows), 'Personal flow', 'owner sees only the own personal flow');
select is((select count(*)::int from public.flow_versions), 1, 'owner sees only the versions of the own flow');
select is((select count(*)::int from public.flow_group_access), 0, 'owner sees no group access');

select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select string_agg(name, ',') from public.flows), 'Shared flow', 'member sees the shared flow of the group, not personal flows');
select is((select count(*)::int from public.flow_versions), 2, 'member sees the versions of the shared flow');
select is((select count(*)::int from public.flow_group_access), 1, 'member sees the access rows of the own group');

select public.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.flows), 0, 'other user sees no flow');
select is((select count(*)::int from public.flow_versions), 0, 'other user sees no version');

-- Admin: full rights
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$insert into public.flows (id, name, owner_id, scope)
  values ('10000000-0000-0000-0000-0000000000f3', 'Admin shared', '00000000-0000-0000-0000-00000000000a', 'shared')$$,
  'admin creates a shared flow');
select lives_ok($$insert into public.flow_group_access (flow_id, group_id)
  values ('10000000-0000-0000-0000-0000000000f3', '30000000-0000-0000-0000-000000000002')$$,
  'admin gives a group access');
select lives_ok($$insert into public.flow_versions (flow_id, version_no, valid_from, definition)
  values ('10000000-0000-0000-0000-0000000000f1', 2, '2026-07-01', '{}')$$,
  'admin adds a version to a personal flow of another user');
select lives_ok($$update public.flows set name = 'Renamed by admin' where id = '10000000-0000-0000-0000-0000000000f1'$$,
  'admin renames any flow');
select is((select name from public.flows where id = '10000000-0000-0000-0000-0000000000f1'), 'Renamed by admin',
  'the rename took effect');
select lives_ok($$select public.publish_flow_version('10000000-0000-0000-0000-0000000000f2', 2)$$, 'admin publishes a version');

-- Owner (user): full rights on the personal flow, nothing on a shared flow
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$insert into public.flows (id, name, owner_id, scope)
  values ('10000000-0000-0000-0000-0000000000f4', 'Owner second', '00000000-0000-0000-0000-0000000000a1', 'personal')$$,
  'owner creates a personal flow');
select throws_ok($$insert into public.flows (name, owner_id, scope)
  values ('Owner shared', '00000000-0000-0000-0000-0000000000a1', 'shared')$$,
  '42501', null, 'owner cannot create a shared flow');
select throws_ok($$insert into public.flows (name, owner_id, scope)
  values ('For someone else', '00000000-0000-0000-0000-0000000000a3', 'personal')$$,
  '42501', null, 'owner cannot create a flow owned by another user');
select lives_ok($$update public.flows set name = 'Owner renamed' where id = '10000000-0000-0000-0000-0000000000f4'$$,
  'owner renames the own flow');
select throws_ok($$update public.flows set scope = 'shared' where id = '10000000-0000-0000-0000-0000000000f4'$$,
  '42501', null, 'owner cannot make a flow shared');
select throws_ok($$update public.flows set owner_id = '00000000-0000-0000-0000-0000000000a3'
  where id = '10000000-0000-0000-0000-0000000000f4'$$,
  '42501', null, 'owner cannot hand a flow to another user');
select lives_ok($$insert into public.flow_versions (flow_id, version_no, valid_from, definition)
  values ('10000000-0000-0000-0000-0000000000f4', 1, '2026-01-01', '{}')$$,
  'owner adds a version to the own flow');
select lives_ok($$update public.flow_versions set change_note = 'x'
  where flow_id = '10000000-0000-0000-0000-0000000000f4' and version_no = 1$$,
  'owner edits a draft of the own flow');
select lives_ok($$select public.publish_flow_version('10000000-0000-0000-0000-0000000000f4', 1)$$,
  'owner publishes a version of the own flow');
with d as (delete from public.flows
  where id = '10000000-0000-0000-0000-0000000000f4' returning 1) select is((select count(*)::int from d), 0,
  'owner cannot delete a flow for good (only soft delete)');
select throws_ok($$insert into public.flow_group_access (flow_id, group_id)
  values ('10000000-0000-0000-0000-0000000000f4', '30000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'owner cannot manage group access');

-- Group member: view and run a shared flow, nothing more
select public.act_as('00000000-0000-0000-0000-0000000000a2');
with u as (update public.flows set name = 'Hacked'
  where id = '10000000-0000-0000-0000-0000000000f2' returning 1) select is((select count(*)::int from u), 0, 'member cannot rename a shared flow');
select throws_ok($$insert into public.flow_versions (flow_id, version_no, valid_from, definition)
  values ('10000000-0000-0000-0000-0000000000f2', 3, '2027-01-01', '{}')$$,
  '42501', null, 'member cannot add a version to a shared flow');
with u as (update public.flow_versions set change_note = 'x'
  where flow_id = '10000000-0000-0000-0000-0000000000f2' and version_no = 1 returning 1) select is((select count(*)::int from u), 0,
  'member cannot edit a version of a shared flow');
with d as (delete from public.flows
  where id = '10000000-0000-0000-0000-0000000000f2' returning 1) select is((select count(*)::int from d), 0, 'member cannot delete a shared flow');
select throws_ok($$select public.publish_flow_version('10000000-0000-0000-0000-0000000000f2', 2)$$,
  'P0002', null, 'member cannot publish a version of a shared flow');
select throws_ok($$insert into public.flow_group_access (flow_id, group_id)
  values ('10000000-0000-0000-0000-0000000000f2', '30000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'member cannot manage group access');
-- A user copies a shared flow into a personal flow, then edits the copy
select lives_ok($$insert into public.flows (id, name, owner_id, scope)
  values ('10000000-0000-0000-0000-0000000000f5', 'Copy of Shared flow', '00000000-0000-0000-0000-0000000000a2', 'personal')$$,
  'member creates a personal copy');
select lives_ok($$insert into public.flow_versions (flow_id, version_no, valid_from, definition)
  select '10000000-0000-0000-0000-0000000000f5', 1, valid_from, definition
  from public.flow_versions where flow_id = '10000000-0000-0000-0000-0000000000f2' and version_no = 1$$,
  'member copies the definition of the shared flow into the copy');
select lives_ok($$update public.flow_versions set definition = '{"edited":true}'
  where flow_id = '10000000-0000-0000-0000-0000000000f5' and version_no = 1$$,
  'member edits the copy');
select is((select count(*)::int from public.flows), 2, 'member now sees the shared flow and the copy');

-- Other user: nothing
select public.act_as('00000000-0000-0000-0000-0000000000a3');
with u as (update public.flows set name = 'Hacked'
  where id = '10000000-0000-0000-0000-0000000000f1' returning 1) select is((select count(*)::int from u), 0, 'other user cannot rename a flow');
select throws_ok($$insert into public.flow_versions (flow_id, version_no, valid_from, definition)
  values ('10000000-0000-0000-0000-0000000000f1', 9, '2027-01-01', '{}')$$,
  '42501', null, 'other user cannot add a version to a personal flow of another user');
with d as (delete from public.flows
  where id = '10000000-0000-0000-0000-0000000000f1' returning 1) select is((select count(*)::int from d), 0, 'other user cannot delete a flow');
select lives_ok($$insert into public.flows (name, owner_id, scope)
  values ('Own flow', '00000000-0000-0000-0000-0000000000a3', 'personal')$$, 'other user creates a personal flow');

-- Soft delete: hidden for users, visible to the admin, restored by the admin only
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$update public.flows set deleted_at = now() where id = '10000000-0000-0000-0000-0000000000f1'$$,
  'owner deletes the personal flow (soft)');
select is((select count(*)::int from public.flows where id = '10000000-0000-0000-0000-0000000000f1'), 0,
  'a deleted flow is hidden from its owner');
select is((select count(*)::int from public.flow_versions where flow_id = '10000000-0000-0000-0000-0000000000f1'), 0,
  'the versions of a deleted flow are hidden too');
with u as (update public.flows set deleted_at = null
  where id = '10000000-0000-0000-0000-0000000000f1' returning 1) select is((select count(*)::int from u), 0, 'owner cannot restore a flow');
select public.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.flows where id = '10000000-0000-0000-0000-0000000000f1' and deleted_at is not null), 1,
  'admin still sees the deleted flow');
select lives_ok($$update public.flows set deleted_at = now() where id = '10000000-0000-0000-0000-0000000000f2'$$,
  'admin deletes a shared flow (soft)');
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.flows where id = '10000000-0000-0000-0000-0000000000f2'), 0,
  'a deleted shared flow is hidden from the group');
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$update public.flows set deleted_at = null where id = '10000000-0000-0000-0000-0000000000f1'$$,
  'admin restores a flow');
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.flows where id = '10000000-0000-0000-0000-0000000000f1'), 1,
  'the owner sees the restored flow');
-- The restore rule also holds below the policies (a non-admin identity that reaches a deleted row)
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000a1');
reset role;
update public.flows set deleted_at = now() where id = '10000000-0000-0000-0000-0000000000f1';
select throws_ok($$update public.flows set deleted_at = null where id = '10000000-0000-0000-0000-0000000000f1'$$,
  'P0001', null, 'only an admin may clear deleted_at, whatever the policies say');

-- Admin may delete a flow for good
select public.act_as('00000000-0000-0000-0000-00000000000a');
with d as (delete from public.flows
  where id = '10000000-0000-0000-0000-0000000000f3' returning 1) select is((select count(*)::int from d), 1, 'admin deletes a flow for good');

select * from finish();
rollback;
