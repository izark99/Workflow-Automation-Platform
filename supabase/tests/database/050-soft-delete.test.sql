-- T3.5: soft delete, restore, removal after 30 days.
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
  ('00000000-0000-0000-0000-0000000000a2', 'Member', 'member@example.test', 'user')
  on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role;
insert into public.groups (id, name) values ('30000000-0000-0000-0000-000000000001', 'Group G');
insert into public.group_members (group_id, user_id) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2');
insert into public.flows (id, name, owner_id, scope) values
  ('10000000-0000-0000-0000-0000000000f1', 'Personal flow', '00000000-0000-0000-0000-0000000000a1', 'personal'),
  ('10000000-0000-0000-0000-0000000000f2', 'Shared flow', '00000000-0000-0000-0000-00000000000a', 'shared'),
  ('10000000-0000-0000-0000-0000000000f3', 'Old flow A', '00000000-0000-0000-0000-0000000000a1', 'personal'),
  ('10000000-0000-0000-0000-0000000000f4', 'Old flow B', '00000000-0000-0000-0000-0000000000a1', 'personal'),
  ('10000000-0000-0000-0000-0000000000f5', 'Recent flow', '00000000-0000-0000-0000-0000000000a1', 'personal');
insert into public.flow_group_access (flow_id, group_id) values
  ('10000000-0000-0000-0000-0000000000f2', '30000000-0000-0000-0000-000000000001');
insert into public.flow_versions (flow_id, version_no, valid_from, status, definition)
select f, 1, date '2026-01-01', 'published', '{}'
from unnest(array['10000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-0000000000f2',
                  '10000000-0000-0000-0000-0000000000f3','10000000-0000-0000-0000-0000000000f4',
                  '10000000-0000-0000-0000-0000000000f5']::uuid[]) f;
insert into public.run_log (flow_id, version_no, user_id, effective_date, status)
values ('10000000-0000-0000-0000-0000000000f3', 1, '00000000-0000-0000-0000-0000000000a1', '2026-09-30', 'ok');

-- Soft delete
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.delete_flow('10000000-0000-0000-0000-0000000000f1')$$, 'owner deletes a personal flow');
select is((select count(*)::int from public.flows where id = '10000000-0000-0000-0000-0000000000f1'), 0, 'the deleted flow is hidden');
select throws_ok($$select public.delete_flow('10000000-0000-0000-0000-0000000000f1')$$, 'P0002', null, 'a flow cannot be deleted twice');
select throws_ok($$select public.delete_flow('10000000-0000-0000-0000-0000000000f2')$$, 'P0002', null, 'a user cannot delete a shared flow');
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.delete_flow('10000000-0000-0000-0000-0000000000f2')$$, 'P0002', null, 'a member cannot delete a shared flow');
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.delete_flow('10000000-0000-0000-0000-0000000000f2')$$, 'admin deletes a shared flow');
select is((select count(*)::int from public.flows where deleted_at is not null), 2, 'admin sees the deleted flows');
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.flows), 0, 'the group no longer sees the deleted shared flow');

-- Restore: admin only
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.restore_flow('10000000-0000-0000-0000-0000000000f1')$$, 'P0002', null, 'owner cannot restore');
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.restore_flow('10000000-0000-0000-0000-0000000000f1')$$, 'admin restores a flow');
select throws_ok($$select public.restore_flow('10000000-0000-0000-0000-0000000000f1')$$, 'P0002', null, 'a flow that is not deleted cannot be restored');
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.flows where id = '10000000-0000-0000-0000-0000000000f1'), 1, 'the owner sees the restored flow');
select is((select count(*)::int from public.flow_versions where flow_id = '10000000-0000-0000-0000-0000000000f1'), 1, 'its versions are back too');

-- Removal for good: a deleted flow only, admin only
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.purge_flow('10000000-0000-0000-0000-0000000000f1')$$, 'P0002', null, 'a live flow cannot be purged');
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.purge_flow('10000000-0000-0000-0000-0000000000f1')$$, 'P0002', null, 'owner cannot purge');
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.purge_flow('10000000-0000-0000-0000-0000000000f2')$$, 'admin purges a deleted flow');
select is((select count(*)::int from public.flows where id = '10000000-0000-0000-0000-0000000000f2'), 0, 'the purged flow is gone');
select is((select count(*)::int from public.flow_group_access where flow_id = '10000000-0000-0000-0000-0000000000f2'), 0,
  'its group access went with it');

-- Removal after 30 days
reset role;
update public.flows set deleted_at = now() - interval '30 days' where id = '10000000-0000-0000-0000-0000000000f3';
update public.flows set deleted_at = now() - interval '45 days' where id = '10000000-0000-0000-0000-0000000000f4';
update public.flows set deleted_at = now() - interval '30 days' + interval '1 second' where id = '10000000-0000-0000-0000-0000000000f5';
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is(public.purge_expired_flows(), 0, 'a user removes nothing');
select public.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.flows where deleted_at is not null), 3, 'three deleted flows before the removal');
select is(public.purge_expired_flows(), 2, 'admin removes the flows deleted 30 days ago or more');
select is((select string_agg(name, ',') from public.flows where deleted_at is not null), 'Recent flow',
  'a flow deleted 29 days and 23 hours ago stays');
reset role;
select is((select count(*)::int from public.flow_versions where flow_id in
  ('10000000-0000-0000-0000-0000000000f3', '10000000-0000-0000-0000-0000000000f4')), 0, 'versions of removed flows are gone');
select is((select count(*)::int from public.run_log where flow_id = '10000000-0000-0000-0000-0000000000f3'), 0,
  'run log rows of a removed flow are gone');

select * from finish();
rollback;
