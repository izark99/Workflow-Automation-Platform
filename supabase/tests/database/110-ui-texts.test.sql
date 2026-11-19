-- T4.7f: ui_texts. Everyone reads, also a signed-out visitor; only an admin writes.
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
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'user@example.test')) as u(id, email);
insert into public.profiles (id, name, email, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', 'User', 'user@example.test', 'user')
  on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role;

insert into public.ui_texts (locale, key, value) values ('vi', 'signIn.title', 'Vào hệ thống');

-- signed out
set local role anon;
select is((select value from public.ui_texts where key = 'signIn.title'), 'Vào hệ thống', 'a signed-out visitor reads a text');
select throws_ok($$insert into public.ui_texts (locale, key, value) values ('en', 'nav.flows', 'X')$$, '42501', null, 'and cannot write');
reset role;

-- a user
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.ui_texts), 1, 'a user reads the texts');
select throws_ok($$insert into public.ui_texts (locale, key, value) values ('en', 'nav.flows', 'X')$$, '42501', null, 'a user cannot add a text');
select lives_ok($$update public.ui_texts set value = 'Hacked'$$, 'a user update runs but sees no row to change');
select lives_ok($$delete from public.ui_texts$$, 'a user delete runs but sees no row to remove');
reset role;
select is((select value from public.ui_texts where key = 'signIn.title'), 'Vào hệ thống', 'nothing was changed');
select is((select count(*)::int from public.ui_texts), 1, 'and nothing was removed');

-- the admin
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$insert into public.ui_texts (locale, key, value) values ('en', 'nav.flows', 'Workflows')$$, 'the admin adds a text');
select is((select updated_by from public.ui_texts where key = 'nav.flows'), '00000000-0000-0000-0000-00000000000a'::uuid, 'the row says who changed it');
select lives_ok($$update public.ui_texts set value = 'My flows' where key = 'nav.flows'$$, 'the admin changes a text');
select is((select value from public.ui_texts where key = 'nav.flows'), 'My flows', 'the change is stored');
select lives_ok($$delete from public.ui_texts where key = 'nav.flows'$$, 'the admin resets a text');
select is((select count(*)::int from public.ui_texts where key = 'nav.flows'), 0, 'and it is gone');
-- the table refuses a client that lies about who changed the row
select lives_ok($$insert into public.ui_texts (locale, key, value, updated_by) values ('en', 'nav.admin', 'Control', '00000000-0000-0000-0000-0000000000a1')$$, 'a forged updated_by is accepted');
select is((select updated_by from public.ui_texts where key = 'nav.admin'), '00000000-0000-0000-0000-00000000000a'::uuid, 'but replaced by the real caller');
-- shape checks
select throws_ok($$insert into public.ui_texts (locale, key, value) values ('fr', 'nav.flows', 'X')$$, '23514', null, 'only the locales en and vi');
select throws_ok($$insert into public.ui_texts (locale, key, value) values ('en', 'no key shape', 'X')$$, '23514', null, 'the key must look like a catalog key');
select throws_ok($$insert into public.ui_texts (locale, key, value) values ('en', 'nav.flows', '')$$, '23514', null, 'a text cannot be empty');
reset role;

select * from finish();
rollback;
