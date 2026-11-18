-- T3.4: row-level security of ref_tables, ref_table_versions, profiles, groups, group_members, run_log.
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
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'other@example.test')) as u(id, email);
insert into public.profiles (id, name, email, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', 'Owner', 'owner@example.test', 'user'),
  ('00000000-0000-0000-0000-0000000000a2', 'Member', 'member@example.test', 'user'),
  ('00000000-0000-0000-0000-0000000000a3', 'Other', 'other@example.test', 'user');
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
  ('10000000-0000-0000-0000-0000000000f1', 1, '2026-01-01', 'published', '{}'),
  ('10000000-0000-0000-0000-0000000000f2', 1, '2026-01-01', 'published', '{}');
insert into public.ref_tables (id, name) values ('20000000-0000-0000-0000-000000000001', 'Limits');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values
  ('20000000-0000-0000-0000-000000000001', 1, '2026-01-01', 'published', '[]', '[]'),
  ('20000000-0000-0000-0000-000000000001', 2, '2026-07-01', 'draft', '[]', '[]');

-- Reference tables: everyone signed in reads, the admin writes
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.ref_tables), 1, 'owner reads reference tables');
select is((select count(*)::int from public.ref_table_versions), 2, 'owner reads reference table versions');
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.ref_tables), 1, 'member reads reference tables');
select public.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.ref_tables), 1, 'other user reads reference tables');
select is((select count(*)::int from public.ref_table_versions), 2, 'other user reads reference table versions');
select throws_ok($$insert into public.ref_tables (name) values ('Mine')$$, '42501', null, 'a user cannot create a reference table');
with u as (update public.ref_tables set name = 'Hacked' returning 1)
  select is((select count(*)::int from u), 0, 'a user cannot rename a reference table');
with d as (delete from public.ref_tables returning 1)
  select is((select count(*)::int from d), 0, 'a user cannot delete a reference table');
select throws_ok($$insert into public.ref_table_versions (ref_table_id, version_no, valid_from)
  values ('20000000-0000-0000-0000-000000000001', 3, '2027-01-01')$$, '42501', null, 'a user cannot add a version');
with u as (update public.ref_table_versions set rows = '[[1]]' where version_no = 2 returning 1)
  select is((select count(*)::int from u), 0, 'a user cannot edit a draft version');
with d as (delete from public.ref_table_versions where version_no = 2 returning 1)
  select is((select count(*)::int from d), 0, 'a user cannot delete a draft version');
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.publish_ref_table_version('20000000-0000-0000-0000-000000000001', 2)$$,
  'P0002', null, 'a member cannot publish a reference table version');

select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$insert into public.ref_tables (id, name) values ('20000000-0000-0000-0000-000000000002', 'Codes')$$,
  'admin creates a reference table');
select lives_ok($$update public.ref_tables set description = 'x' where id = '20000000-0000-0000-0000-000000000002'$$,
  'admin edits a reference table');
select lives_ok($$insert into public.ref_table_versions (ref_table_id, version_no, valid_from)
  values ('20000000-0000-0000-0000-000000000002', 1, '2026-01-01')$$, 'admin adds a version');
select lives_ok($$update public.ref_table_versions set rows = '[[1]]'
  where ref_table_id = '20000000-0000-0000-0000-000000000001' and version_no = 2$$, 'admin edits a draft version');
select lives_ok($$select public.publish_ref_table_version('20000000-0000-0000-0000-000000000001', 2)$$,
  'admin publishes a version');
select throws_ok($$update public.ref_table_versions set rows = '[]'
  where ref_table_id = '20000000-0000-0000-0000-000000000001' and version_no = 2$$,
  'P0001', null, 'not even the admin edits a published version');
select lives_ok($$delete from public.ref_tables where id = '20000000-0000-0000-0000-000000000002'$$,
  'admin deletes a reference table');

-- Profiles: a user reads the own row only, the admin manages all
select public.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.profiles), 4, 'admin sees every profile');
select lives_ok($$update public.profiles set name = 'Owner Renamed' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'admin edits a profile');
select lives_ok($$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a3'$$,
  'admin changes a role');
select lives_ok($$update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-0000000000a3'$$,
  'admin changes a role back');
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select string_agg(name, ',') from public.profiles), 'Owner Renamed', 'a user sees only the own profile');
with u as (update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1' returning 1)
  select is((select count(*)::int from u), 0, 'a user cannot make themselves admin');
with u as (update public.profiles set name = 'Boss' where id = '00000000-0000-0000-0000-0000000000a1' returning 1)
  select is((select count(*)::int from u), 0, 'a user cannot edit the own profile');
select throws_ok($$insert into public.profiles (id, name, email) values (gen_random_uuid(), 'X', 'x@example.test')$$,
  '42501', null, 'a user cannot add a profile');
with d as (delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a1' returning 1)
  select is((select count(*)::int from d), 0, 'a user cannot delete a profile');

-- Groups and members: the admin only
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.groups), 0, 'a member cannot read groups');
select is((select count(*)::int from public.group_members), 0, 'a member cannot read group members');
select throws_ok($$insert into public.group_members (group_id, user_id)
  values ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2')$$,
  '42501', null, 'a member cannot add themselves to another group');
select throws_ok($$insert into public.groups (name) values ('Mine')$$, '42501', null, 'a user cannot create a group');
with u as (update public.groups set name = 'Hacked' returning 1)
  select is((select count(*)::int from u), 0, 'a user cannot rename a group');
with d as (delete from public.group_members returning 1)
  select is((select count(*)::int from d), 0, 'a member cannot leave a group by deleting the row');
select public.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.groups), 0, 'other user cannot read groups');
select public.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.groups), 2, 'admin reads groups');
select is((select count(*)::int from public.group_members), 1, 'admin reads group members');
select lives_ok($$insert into public.groups (id, name) values ('30000000-0000-0000-0000-000000000003', 'Group I')$$, 'admin creates a group');
select lives_ok($$update public.groups set name = 'Group I2' where id = '30000000-0000-0000-0000-000000000003'$$, 'admin renames a group');
select lives_ok($$insert into public.group_members (group_id, user_id)
  values ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a3')$$, 'admin adds a member');
select lives_ok($$delete from public.group_members where group_id = '30000000-0000-0000-0000-000000000003'$$, 'admin removes a member');
select lives_ok($$delete from public.groups where id = '30000000-0000-0000-0000-000000000003'$$, 'admin deletes a group');

-- Run log: a user logs a run of a flow they can run, reads the own rows, nobody edits or deletes
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$insert into public.run_log (flow_id, version_no, user_id, effective_date, status)
  values ('10000000-0000-0000-0000-0000000000f2', 1, '00000000-0000-0000-0000-0000000000a2', '2026-09-30', 'ok')$$,
  'a member logs a run of a shared flow');
select throws_ok($$insert into public.run_log (flow_id, version_no, user_id, effective_date, status)
  values ('10000000-0000-0000-0000-0000000000f2', 1, '00000000-0000-0000-0000-0000000000a1', '2026-09-30', 'ok')$$,
  '42501', null, 'a user cannot log a run for someone else');
select throws_ok($$insert into public.run_log (flow_id, version_no, user_id, effective_date, status)
  values ('10000000-0000-0000-0000-0000000000f1', 1, '00000000-0000-0000-0000-0000000000a2', '2026-09-30', 'ok')$$,
  '42501', null, 'a user cannot log a run of a flow they cannot see');
select is((select count(*)::int from public.run_log), 1, 'a member reads the own run');
with u as (update public.run_log set status = 'failed' returning 1)
  select is((select count(*)::int from u), 0, 'a user cannot edit the run log');
with d as (delete from public.run_log returning 1)
  select is((select count(*)::int from d), 0, 'a user cannot delete from the run log');
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$insert into public.run_log (flow_id, version_no, user_id, effective_date, status)
  values ('10000000-0000-0000-0000-0000000000f1', 1, '00000000-0000-0000-0000-0000000000a1', '2026-09-30', 'failed')$$,
  'an owner logs a run of the own flow');
select is((select count(*)::int from public.run_log), 1, 'an owner reads only the own runs');
select public.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.run_log), 0, 'other user reads no runs');
select public.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.run_log), 2, 'admin reads every run');
with u as (update public.run_log set status = 'ok' returning 1)
  select is((select count(*)::int from u), 0, 'not even the admin edits the run log');

-- A signed-out visitor (role anon) reaches nothing
reset role;
set local role anon;
select throws_ok($$select count(*) from public.flows$$, '42501', null, 'anon cannot read flows');
select throws_ok($$select count(*) from public.ref_tables$$, '42501', null, 'anon cannot read reference tables');
select throws_ok($$select count(*) from public.profiles$$, '42501', null, 'anon cannot read profiles');
select throws_ok($$select count(*) from public.run_log$$, '42501', null, 'anon cannot read the run log');
reset role;

select * from finish();
rollback;
