-- T5.10: app_settings. Active users read, an active admin writes, a visitor has nothing, the value is checked.
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
  ('00000000-0000-0000-0000-00000000000b'::uuid, 'admin2@example.test'),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'user@example.test'),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'locked@example.test')) as u(id, email);
insert into public.profiles (id, name, email, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin@example.test', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Locked Admin', 'admin2@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', 'User', 'user@example.test', 'user'),
  ('00000000-0000-0000-0000-0000000000a2', 'Locked', 'locked@example.test', 'user')
  on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role;
update public.profiles set locked_at = now() where id in ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a2');

-- the migration made the row
select is((select value from public.app_settings where key = 'idle_timeout_hours'), '8'::jsonb, 'the migration creates idle_timeout_hours = 8');

-- a visitor has nothing
set local role anon;
select throws_ok($$select * from public.app_settings$$, '42501', null, 'anon cannot read');
select throws_ok($$update public.app_settings set value = '1'$$, '42501', null, 'anon cannot write');
reset role;

-- an active user reads, and cannot write
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select value from public.app_settings where key = 'idle_timeout_hours'), '8'::jsonb, 'a user reads the limit');
select lives_ok($$update public.app_settings set value = '1' where key = 'idle_timeout_hours'$$, 'a user update runs but sees no row');
select throws_ok($$insert into public.app_settings (key, value) values ('other_setting', '1')$$, '42501', null, 'a user cannot add a setting');
select lives_ok($$delete from public.app_settings$$, 'a user delete runs but sees no row');
reset role;
select is((select value from public.app_settings where key = 'idle_timeout_hours'), '8'::jsonb, 'nothing was changed by the user');

-- a locked user reads nothing
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.app_settings), 0, 'a locked user reads nothing');
reset role;

-- a locked admin is no admin
select public.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.app_settings), 0, 'a locked admin reads nothing');
select throws_ok($$insert into public.app_settings (key, value) values ('other_setting', '1')$$, '42501', null, 'and cannot add');
select lives_ok($$update public.app_settings set value = '2' where key = 'idle_timeout_hours'$$, 'a locked admin update runs but sees no row');
reset role;
select is((select value from public.app_settings where key = 'idle_timeout_hours'), '8'::jsonb, 'nothing was changed by the locked admin');

-- the active admin writes
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$update public.app_settings set value = '12' where key = 'idle_timeout_hours'$$, 'the admin changes the limit');
select is((select value from public.app_settings where key = 'idle_timeout_hours'), '12'::jsonb, 'the change is stored');
select is((select updated_by from public.app_settings where key = 'idle_timeout_hours'), '00000000-0000-0000-0000-00000000000a'::uuid, 'the row says who changed it');
select lives_ok($$update public.app_settings set value = '1' where key = 'idle_timeout_hours'$$, '1 is accepted');
select lives_ok($$update public.app_settings set value = '72' where key = 'idle_timeout_hours'$$, '72 is accepted');
select lives_ok($$update public.app_settings set value = '8.0' where key = 'idle_timeout_hours'$$, '8.0 is a whole number');
select throws_ok($$update public.app_settings set value = '0' where key = 'idle_timeout_hours'$$, '23514', null, '0 is refused');
select throws_ok($$update public.app_settings set value = '73' where key = 'idle_timeout_hours'$$, '23514', null, '73 is refused');
select throws_ok($$update public.app_settings set value = '1.5' where key = 'idle_timeout_hours'$$, '23514', null, '1.5 is refused');
select throws_ok($$update public.app_settings set value = '"8"' where key = 'idle_timeout_hours'$$, '23514', null, 'the text "8" is refused');
select throws_ok($$update public.app_settings set value = 'null' where key = 'idle_timeout_hours'$$, '23514', null, 'a JSON null is refused');
select throws_ok($$update public.app_settings set value = '{"a":1}' where key = 'idle_timeout_hours'$$, '23514', null, 'an object is refused');
select throws_ok($$update public.app_settings set value = 'true' where key = 'idle_timeout_hours'$$, '23514', null, 'a boolean is refused');
select is((select value from public.app_settings where key = 'idle_timeout_hours'), '8.0'::jsonb, 'the last valid value stays');
-- a forged updated_by is replaced
select lives_ok($$insert into public.app_settings (key, value, updated_by) values ('other_setting', '"x"', '00000000-0000-0000-0000-0000000000a1')$$, 'a forged updated_by is accepted');
select is((select updated_by from public.app_settings where key = 'other_setting'), '00000000-0000-0000-0000-00000000000a'::uuid, 'but replaced by the real caller');
-- key shape
select throws_ok($$insert into public.app_settings (key, value) values ('Bad Key', '1')$$, '23514', null, 'the key must be a lower-case name');
reset role;

-- the stamping function is for the trigger only (D82)
select ok(not has_function_privilege('anon', 'public.stamp_app_setting()', 'execute'), 'a visitor cannot call the stamping function');
select ok(not has_function_privilege('authenticated', 'public.stamp_app_setting()', 'execute'), 'a signed-in user cannot call it either');

select * from finish();
