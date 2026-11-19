-- T5.8: save_ui_texts saves two languages and resets in one transaction.
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

insert into public.ui_texts (locale, key, value) values ('vi', 'nav.admin', 'Điều khiển'), ('en', 'nav.admin', 'Control');

-- a signed-out visitor cannot call it
set local role anon;
select throws_ok($$select public.save_ui_texts('[]', '[]')$$, '42501', null, 'a visitor cannot call the function');
reset role;
select ok(not has_function_privilege('anon', 'public.save_ui_texts(jsonb, jsonb)', 'execute'), 'anon has no EXECUTE');
select ok(has_function_privilege('authenticated', 'public.save_ui_texts(jsonb, jsonb)', 'execute'), 'authenticated has EXECUTE');

-- a user is refused, and nothing changes
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.save_ui_texts('[{"locale":"en","key":"nav.flows","value":"X"}]', '[]')$$, '42501', null, 'a user is refused');
select throws_ok($$select public.save_ui_texts('[]', '[{"locale":"en","key":"nav.admin"}]')$$, '42501', null, 'a user cannot reset either');
reset role;
select is((select count(*)::int from public.ui_texts), 2, 'nothing changed');

-- the admin saves two languages and resets one in one call
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$select public.save_ui_texts(
    '[{"locale":"en","key":"nav.flows","value":"Pipelines"},{"locale":"vi","key":"nav.flows","value":"Quy trình"}]',
    '[{"locale":"vi","key":"nav.admin"}]')$$,
  'the admin saves two languages and resets one');
select is((select value from public.ui_texts where locale = 'en' and key = 'nav.flows'), 'Pipelines', 'English is stored');
select is((select value from public.ui_texts where locale = 'vi' and key = 'nav.flows'), 'Quy trình', 'Vietnamese is stored');
select is((select count(*)::int from public.ui_texts where locale = 'vi' and key = 'nav.admin'), 0, 'the reset removed the Vietnamese edit');
select is((select count(*)::int from public.ui_texts where locale = 'en' and key = 'nav.admin'), 1, 'and left the English edit');
select is((select updated_by from public.ui_texts where key = 'nav.flows' and locale = 'en'), '00000000-0000-0000-0000-00000000000a'::uuid, 'the rows say who changed them');
-- an existing key is updated
select lives_ok($$select public.save_ui_texts('[{"locale":"en","key":"nav.flows","value":"Workflows"}]', '[]')$$, 'a second save updates');
select is((select value from public.ui_texts where locale = 'en' and key = 'nav.flows'), 'Workflows', 'the value changed');
-- empty arrays and nulls are fine
select lives_ok($$select public.save_ui_texts('[]', '[]')$$, 'an empty call is fine');
select lives_ok($$select public.save_ui_texts(null, null)$$, 'null arrays are fine');
select throws_ok($$select public.save_ui_texts('{"a":1}', '[]')$$, '22023', null, 'an object instead of an array is refused');

-- a bad locale, a bad key or an empty text rolls back every change of the call
select throws_ok(
  $$select public.save_ui_texts(
    '[{"locale":"en","key":"nav.flows","value":"Changed"},{"locale":"fr","key":"nav.flows","value":"Oops"}]',
    '[{"locale":"en","key":"nav.admin"}]')$$,
  '23514', null, 'a bad locale fails the call');
select is((select value from public.ui_texts where locale = 'en' and key = 'nav.flows'), 'Workflows', 'the earlier entry of the call was rolled back');
select is((select count(*)::int from public.ui_texts where locale = 'en' and key = 'nav.admin'), 1, 'and the reset of the call too');
select throws_ok($$select public.save_ui_texts('[{"locale":"en","key":"nav.flows","value":"Fine"},{"locale":"vi","key":"no key shape","value":"X"}]', '[]')$$, '23514', null, 'a bad key fails the call');
select is((select value from public.ui_texts where locale = 'en' and key = 'nav.flows'), 'Workflows', 'the entry before the bad key was rolled back');
select throws_ok($$select public.save_ui_texts('[{"locale":"en","key":"nav.flows","value":"Fine"},{"locale":"vi","key":"nav.flows","value":""}]', '[]')$$, '23514', null, 'an empty text fails the call');
select is((select value from public.ui_texts where locale = 'en' and key = 'nav.flows'), 'Workflows', 'the entry before the empty text was rolled back');
reset role;

select * from finish();
