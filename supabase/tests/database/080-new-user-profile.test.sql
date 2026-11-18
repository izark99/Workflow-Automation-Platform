-- T3.7a: a profile appears when an Auth user is created. The role is always 'user'.
begin;
select * from no_plan();

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'Nina.Named@Example.test', '{"name":"  Nina Named  "}');
select results_eq($$select name, email, role from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'$$,
  $$values ('Nina Named', 'Nina.Named@Example.test', 'user')$$, 'a profile is created with the name from the metadata, trimmed');

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'pat.nameless@example.test');
select is((select name from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'), 'pat.nameless',
  'without a name, the part of the email before the @ is used');

-- The metadata of a user is editable by that user at sign-up, so it never decides the role
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'eve.escalate@example.test', '{"name":"Eve","role":"admin"}', '{"role":"admin"}');
select is((select role from public.profiles where id = '00000000-0000-0000-0000-0000000000c3'), 'user',
  'a role in the metadata is ignored');

-- A user without an email (phone sign-in) gets no profile, and creating the user does not fail
insert into auth.users (id, instance_id, aud, role, phone)
values ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '+10000000004');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000c4'), 0,
  'no email, no profile, and no error');

-- An email that a profile already uses (ignoring case) does not block the new Auth user
select lives_ok($$insert into auth.users (id, instance_id, aud, role, email)
  values ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'NINA.NAMED@example.test')$$, 'a clash of emails does not stop the Auth user from being created');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000c5'), 0, 'and no second profile is made');

select * from finish();
rollback;
