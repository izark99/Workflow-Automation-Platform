-- T3.6c2: visible_names() gives the names the screens need (owner of a flow, groups of a flow) without opening
-- profiles and groups to everyone.
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

select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select string_agg(kind || ':' || name, ',' order by kind, name) from public.visible_names()),
  'group:Group G,user:Admin', 'a member gets the owner and the group of the shared flow, and nothing else');

select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select string_agg(kind || ':' || name, ',' order by kind, name) from public.visible_names()),
  'user:Owner', 'an owner gets the own name only');

select public.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.visible_names()), 0, 'another user gets nothing');

select public.act_as('00000000-0000-0000-0000-00000000000a');
select is((select string_agg(kind || ':' || name, ',' order by kind, name) from public.visible_names()),
  'group:Group G,user:Admin,user:Owner', 'the admin gets the owners and the groups of every flow (Group H has no flow)');

-- A deleted flow is hidden from its owner, so its names go too
select lives_ok($$select public.delete_flow('10000000-0000-0000-0000-0000000000f2')$$, 'admin deletes the shared flow');
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.visible_names()), 0, 'a member no longer gets names of a deleted flow');

reset role;
set local role anon;
select throws_ok($$select * from public.visible_names()$$, '42501', null, 'anon cannot call it');
reset role;

select * from finish();
rollback;
