-- T4.8a: a locked account. A locked user with a valid token reads and writes nothing; a locked admin is no admin.
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
  ('00000000-0000-0000-0000-00000000000b', 'Admin Two', 'admin2@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', 'User', 'user@example.test', 'user'),
  ('00000000-0000-0000-0000-0000000000a2', 'Locked', 'locked@example.test', 'user')
  on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role;
insert into public.groups (id, name) values ('30000000-0000-0000-0000-000000000001', 'Group G');
insert into public.group_members (group_id, user_id) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2');
insert into public.flows (id, name, owner_id, scope) values
  ('10000000-0000-0000-0000-0000000000f1', 'Locked own flow', '00000000-0000-0000-0000-0000000000a2', 'personal'),
  ('10000000-0000-0000-0000-0000000000f2', 'Shared flow', '00000000-0000-0000-0000-00000000000a', 'shared');
insert into public.flow_group_access (flow_id, group_id) values ('10000000-0000-0000-0000-0000000000f2', '30000000-0000-0000-0000-000000000001');
insert into public.flow_versions (flow_id, version_no, valid_from, status, definition) values
  ('10000000-0000-0000-0000-0000000000f1', 1, '2026-01-01', 'draft', '{}'),
  ('10000000-0000-0000-0000-0000000000f2', 1, '2026-01-01', 'published', '{}');
insert into public.ref_tables (id, name) values ('20000000-0000-0000-0000-000000000001', 'Limits');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values
  ('20000000-0000-0000-0000-000000000001', 1, '2026-01-01', 'published', '[]', '[]');
insert into public.run_log (flow_id, version_no, user_id, effective_date, status) values ('10000000-0000-0000-0000-0000000000f2', 1, '00000000-0000-0000-0000-0000000000a2', '2026-09-30', 'ok');
insert into public.ui_texts (locale, key, value) values ('vi', 'signIn.title', 'Vào hệ thống');

-- Before the lock the user reads and writes as before
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.flows), 2, 'before the lock the user sees the own flow and the shared flow');
select ok(public.is_active_user(), 'an unlocked user is active');
reset role;

-- The lock, through the service role function
set local role service_role;
select lives_ok($$select public.admin_set_locked('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', true)$$, 'the admin locks the user');
reset role;
select isnt((select locked_at from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'), null, 'locked_at is set');

-- A locked user with a valid token: nothing is readable
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select ok(not public.is_active_user(), 'a locked user is not active');
select is((select count(*)::int from public.flows), 0, 'flows: nothing, not even the own flow');
select is((select count(*)::int from public.flow_versions), 0, 'flow_versions: nothing');
select is((select count(*)::int from public.flow_group_access), 0, 'flow_group_access: nothing');
select is((select count(*)::int from public.ref_tables), 0, 'ref_tables: nothing');
select is((select count(*)::int from public.ref_table_versions), 0, 'ref_table_versions: nothing');
select is((select count(*)::int from public.profiles), 0, 'profiles: not even the own row');
select is((select count(*)::int from public.groups), 0, 'groups: nothing');
select is((select count(*)::int from public.group_members), 0, 'group_members: nothing');
select is((select count(*)::int from public.run_log), 0, 'run_log: nothing');
select is((select count(*)::int from public.ui_texts), 0, 'ui_texts: nothing');
select is((select count(*)::int from public.visible_names()), 0, 'visible_names(): nothing');
-- and nothing is writable
select throws_ok($$insert into public.flows (name, owner_id, scope) values ('Mine', '00000000-0000-0000-0000-0000000000a2', 'personal')$$, '42501', null, 'insert into flows is refused');
select throws_ok($$insert into public.run_log (flow_id, version_no, user_id, effective_date, status) values ('10000000-0000-0000-0000-0000000000f2', 1, '00000000-0000-0000-0000-0000000000a2', '2026-09-30', 'ok')$$, '42501', null, 'insert into run_log is refused');
select throws_ok($$select public.create_flow('Mine', 'personal')$$, '42501', null, 'create_flow is refused');
select throws_ok($$select public.copy_flow('10000000-0000-0000-0000-0000000000f2', 'Copy')$$, 'P0002', null, 'copy_flow finds nothing');
select throws_ok($$select public.create_flow_version('10000000-0000-0000-0000-0000000000f1', '2026-07-01')$$, 'P0002', null, 'create_flow_version finds nothing');
select throws_ok($$select public.publish_flow_version('10000000-0000-0000-0000-0000000000f1', 1)$$, 'P0002', null, 'publish_flow_version finds nothing');
select throws_ok($$select public.delete_flow('10000000-0000-0000-0000-0000000000f1')$$, 'P0002', null, 'delete_flow finds nothing');
select throws_ok($$select public.restore_flow('10000000-0000-0000-0000-0000000000f1')$$, 'P0002', null, 'restore_flow finds nothing');
select throws_ok($$select public.purge_flow('10000000-0000-0000-0000-0000000000f1')$$, 'P0002', null, 'purge_flow finds nothing');
select throws_ok($$select public.create_ref_table('T', '', '[]'::jsonb)$$, '42501', null, 'create_ref_table is refused');
select throws_ok($$select public.create_ref_table_version('20000000-0000-0000-0000-000000000001', '2026-07-01')$$, 'P0002', null, 'create_ref_table_version finds nothing');
select throws_ok($$select public.publish_ref_table_version('20000000-0000-0000-0000-000000000001', 1)$$, 'P0002', null, 'publish_ref_table_version finds nothing');
select throws_ok($$select public.set_flow_groups('10000000-0000-0000-0000-0000000000f2', '{}')$$, '42501', null, 'set_flow_groups is refused');
select throws_ok($$select public.set_user_groups('00000000-0000-0000-0000-0000000000a1', '{}')$$, '42501', null, 'set_user_groups is refused');
select throws_ok($$select public.clear_must_change_password()$$, '42501', null, 'a locked user cannot clear the password flag');
select lives_ok($$update public.flows set name = 'Hacked'$$, 'an update runs but sees no row');
select lives_ok($$delete from public.flows$$, 'a delete runs but sees no row');
-- the only thing the app may learn
select is((select locked from public.account_status()), true, 'account_status says locked');
reset role;
select is((select count(*)::int from public.flows), 2, 'no flow was changed or removed');
select is((select name from public.flows where id = '10000000-0000-0000-0000-0000000000f1'), 'Locked own flow', 'and no name changed');

-- A locked admin is not an admin
update public.profiles set locked_at = now() where id = '00000000-0000-0000-0000-00000000000b';
select public.act_as('00000000-0000-0000-0000-00000000000b');
select ok(not public.is_admin(), 'a locked admin is not an admin');
select throws_ok($$select public.set_user_groups('00000000-0000-0000-0000-0000000000a1', '{}')$$, '42501', null, 'a locked admin cannot set user groups');
select throws_ok($$insert into public.ui_texts (locale, key, value) values ('en', 'nav.flows', 'X')$$, '42501', null, 'a locked admin cannot write texts');
select is((select count(*)::int from public.profiles), 0, 'a locked admin reads no profile');
reset role;

-- anon still reads the texts (the sign-in screen needs them)
set local role anon;
select is((select count(*)::int from public.ui_texts), 1, 'a signed-out visitor still reads the texts');
reset role;

-- Unlock: access comes back
set local role service_role;
select lives_ok($$select public.admin_set_locked('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', false)$$, 'the admin unlocks the user');
select lives_ok($$select public.admin_set_locked('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', false)$$, 'and the second admin');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.flows), 2, 'after the unlock the user reads the flows again');
select is((select count(*)::int from public.ui_texts), 1, 'and the texts');
reset role;

-- Rules
set local role service_role;
select throws_ok($$select public.admin_set_locked('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', true)$$, '22023', null, 'an admin cannot lock themselves');
select throws_ok($$select public.admin_set_locked('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', true)$$, '42501', null, 'a user cannot lock anyone');
select throws_ok($$select public.admin_set_locked('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000ff', true)$$, 'P0002', null, 'locking an unknown user finds nothing');
select lives_ok($$select public.admin_set_must_change_password('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', true)$$, 'the admin sets must_change_password');
reset role;
select is((select must_change_password from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), true, 'the flag is set');
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select must_change_password from public.account_status()), true, 'the user sees the flag in account_status');
select lives_ok($$select public.clear_must_change_password()$$, 'the user clears the flag on the own row');
select is((select must_change_password from public.account_status()), false, 'and it is cleared');
reset role;

-- Only the functions change the two columns: not even an admin with a plain update
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$update public.profiles set locked_at = now() where id = '00000000-0000-0000-0000-0000000000a1'$$, '42501', null, 'an admin cannot lock with a plain update');
select throws_ok($$update public.profiles set must_change_password = true where id = '00000000-0000-0000-0000-0000000000a1'$$, '42501', null, 'nor set the password flag');
select throws_ok($$insert into public.profiles (id, name, email, role, locked_at) values (gen_random_uuid(), 'X', 'x@example.test', 'user', now())$$, '42501', null, 'nor insert a locked profile');
reset role;
-- authenticated cannot call the service functions
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.admin_set_locked('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', true)$$, '42501', null, 'an admin token cannot call admin_set_locked');
select throws_ok($$select public.admin_set_must_change_password('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', true)$$, '42501', null, 'nor admin_set_must_change_password');
reset role;

-- The last active admin cannot be locked, demoted or deleted
update public.profiles set locked_at = now() where id = '00000000-0000-0000-0000-00000000000b';
select throws_ok($$update public.profiles set locked_at = now() where id = '00000000-0000-0000-0000-00000000000a'$$, 'P0001', null, 'the last active admin cannot be locked');
select throws_ok($$update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-00000000000a'$$, 'P0001', null, 'the last active admin cannot be demoted');
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-00000000000a'$$, 'P0001', null, 'the last active admin cannot be deleted');
update public.profiles set locked_at = null where id = '00000000-0000-0000-0000-00000000000b';
select lives_ok($$update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-00000000000b'$$, 'with another active admin a demotion is allowed');

-- Guards against forgetting: a table or a definer function added later fails here until it is reviewed
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                        and p.permissive = 'RESTRICTIVE' and 'authenticated' = any (p.roles))),
  0, 'every table with row-level security has a restrictive active-only policy for authenticated');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef),
  array['account_status', 'admin_end_sessions', 'admin_set_locked', 'admin_set_must_change_password', 'can_edit_flow', 'can_view_flow', 'clear_must_change_password',
        'handle_new_user', 'is_active_user', 'is_admin', 'is_group_member', 'keep_alive', 'stamp_app_setting', 'stamp_ui_text', 'visible_names'],
  'the security definer functions are the reviewed ones');

select * from finish();
rollback;
