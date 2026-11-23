-- Migration 20: profiles.max_flows and the trigger that enforces it on every new flow.
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
  ('00000000-0000-0000-0000-0000000000c1'::uuid, 'limited@example.test'),
  ('00000000-0000-0000-0000-0000000000c2'::uuid, 'free@example.test'),
  ('00000000-0000-0000-0000-0000000000c3'::uuid, 'none@example.test')) as u(id, email);
insert into public.profiles (id, name, email, role, max_flows) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin@example.test', 'admin', 0),
  ('00000000-0000-0000-0000-0000000000c1', 'Limited', 'limited@example.test', 'user', 2),
  ('00000000-0000-0000-0000-0000000000c2', 'Free', 'free@example.test', 'user', null),
  ('00000000-0000-0000-0000-0000000000c3', 'None', 'none@example.test', 'user', 0)
  on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role, max_flows = excluded.max_flows;

-- the value is checked by the table
select throws_ok($$update public.profiles set max_flows = -1 where id = '00000000-0000-0000-0000-0000000000c2'$$, '23514', null, 'a negative limit is refused');
select throws_ok($$update public.profiles set max_flows = 10001 where id = '00000000-0000-0000-0000-0000000000c2'$$, '23514', null, 'a limit above 10000 is refused');

-- a user with a limit of 2
select public.act_as('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$select public.create_flow('One')$$, 'the first flow is created');
select lives_ok($$select public.create_flow('Two')$$, 'the second flow is created');
select throws_ok($$select public.create_flow('Three')$$, 'P0001', 'You have reached the limit of 2 flows that the admin set for you. Delete a flow, or ask the admin to raise the limit.', 'the third is refused, with the words of the app');
select is((select count(*)::int from public.flows where owner_id = '00000000-0000-0000-0000-0000000000c1'), 2, 'no third flow exists');
-- a copy is a flow too
select throws_ok($$select public.copy_flow((select id from public.flows where name = 'One'), 'Copy')$$, 'P0001', null, 'a copy of a flow is refused as well');
-- a direct insert is covered by the trigger
select throws_ok($$insert into public.flows (name, owner_id, scope) values ('Direct', '00000000-0000-0000-0000-0000000000c1', 'personal')$$, 'P0001', null, 'a direct insert is refused');
-- a user cannot raise their own limit
update public.profiles set max_flows = 99 where id = '00000000-0000-0000-0000-0000000000c1';
-- a deleted flow does not count
select lives_ok($$select public.delete_flow((select id from public.flows where name = 'One'))$$, 'the user deletes a flow');
select lives_ok($$select public.create_flow('Four')$$, 'and can create one again');
select throws_ok($$select public.create_flow('Five')$$, 'P0001', null, 'but not two');
reset role;
select is((select max_flows from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 2, 'the update of the own limit by the user changed nothing');

-- the admin raises the limit; empty means no limit
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$update public.profiles set max_flows = 3 where id = '00000000-0000-0000-0000-0000000000c1'$$, 'the admin sets the limit to 3');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$select public.create_flow('Five')$$, 'one more flow fits');
reset role;
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$update public.profiles set max_flows = null where id = '00000000-0000-0000-0000-0000000000c1'$$, 'the admin removes the limit');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$select public.create_flow('Six')$$, 'with no limit there is no end');
reset role;

-- a user with no limit set, and a user with a limit of 0
select public.act_as('00000000-0000-0000-0000-0000000000c2');
select lives_ok($$select public.create_flow('A')$$, 'a user with no limit creates a flow');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000c3');
select throws_ok($$select public.create_flow('B')$$, 'P0001', 'You have reached the limit of 0 flows that the admin set for you. Delete a flow, or ask the admin to raise the limit.', 'a limit of 0 means no flow at all');
reset role;

-- an admin has no limit, whatever the value
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.create_flow('Admin flow', 'shared')$$, 'an admin with max_flows = 0 still creates flows');
reset role;

select * from finish();
rollback;
