-- T3.9: the first admin is made with the statement in docs/DEPLOY.md. A test in scripts/deploy-doc.test.ts checks that
-- the line below is the same as in the document.
begin;
select * from no_plan();

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'first.admin@example.com'),
       ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'second.person@example.com');

select is((select string_agg(email || ':' || role, ',' order by email) from public.profiles),
  'first.admin@example.com:user,second.person@example.com:user', 'every new account starts as a user');

update public.profiles set role = 'admin' where email = 'first.admin@example.com';

select is((select string_agg(email || ':' || role, ',' order by email) from public.profiles),
  'first.admin@example.com:admin,second.person@example.com:user', 'the statement makes exactly that person an admin');

-- The new admin can then work as an admin through row-level security
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.profiles), 2, 'the admin sees every profile');
select lives_ok($$update public.profiles set role = 'admin' where email = 'second.person@example.com'$$, 'the admin makes another admin');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.profiles), 2, 'the second admin sees every profile as well');

select * from finish();
rollback;
