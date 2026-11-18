-- T3.8: keep_alive() touches the database and returns the time. It gives away nothing and changes nothing.
begin;
select * from no_plan();

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'keep@example.test');

set local role anon;
select ok(public.keep_alive() between now() - interval '1 minute' and now() + interval '1 minute', 'a signed-out caller gets the current time');
select throws_ok($$select count(*) from public.profiles$$, '42501', null, 'and still cannot read a table');
reset role;

set local role authenticated;
select isnt(public.keep_alive(), null, 'a signed-in caller can call it too');
reset role;

select is((select count(*)::int from public.profiles), 1, 'it changed nothing');
select ok(has_function_privilege('service_role', 'public.keep_alive()', 'execute'), 'the service role can call it');

select * from finish();
rollback;
