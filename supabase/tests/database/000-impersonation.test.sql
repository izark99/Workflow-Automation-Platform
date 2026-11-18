-- Smoke test for the test harness itself. The permission tests in later files
-- rely on this pattern: fake users in auth.users, then act as one of them.
begin;
select plan(6);

select has_table('auth', 'users', 'auth.users exists');
select has_function('auth', 'uid', 'auth.uid() exists');

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'smoke@example.test');

select is(auth.uid(), null, 'auth.uid() is null without claims');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is(auth.uid(), '00000000-0000-0000-0000-0000000000a1'::uuid,
  'auth.uid() returns the impersonated user');
select is(current_user::text, 'authenticated', 'role switched to authenticated');

reset role;
select is(current_user::text, 'postgres', 'role switched back');

select * from finish();
rollback;
