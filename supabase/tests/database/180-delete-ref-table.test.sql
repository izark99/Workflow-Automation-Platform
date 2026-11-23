-- Migration 19: delete_ref_table. An admin deletes a table that no live flow reads; a table in use is refused with the names of the flows.
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
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 'locked-admin@example.test'),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'owner@example.test')) as u(id, email);
insert into public.profiles (id, name, email, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000b1', 'Locked admin', 'locked-admin@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', 'Owner', 'owner@example.test', 'user')
  on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role;
update public.profiles set locked_at = now() where id = '00000000-0000-0000-0000-0000000000b1';

insert into public.ref_tables (id, name, description) values
  ('20000000-0000-0000-0000-0000000000d1', 'Free', ''),
  ('20000000-0000-0000-0000-0000000000d2', 'Used', ''),
  ('20000000-0000-0000-0000-0000000000d3', 'OnlyInDeletedFlow', ''),
  ('20000000-0000-0000-0000-0000000000d4', 'ForUser', ''),
  ('20000000-0000-0000-0000-0000000000d5', 'ForLocked', '');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status, columns, rows) values
  ('20000000-0000-0000-0000-0000000000d1', 1, '2026-01-01', '2026-06-30', 'published', '[]', '[[1]]'),
  ('20000000-0000-0000-0000-0000000000d1', 2, '2026-07-01', null, 'draft', '[]', '[[2]]'),
  ('20000000-0000-0000-0000-0000000000d2', 1, '2026-01-01', null, 'published', '[]', '[[3]]');
insert into public.flows (id, name, owner_id, scope) values
  ('10000000-0000-0000-0000-0000000000e1', 'Reads Used', '00000000-0000-0000-0000-0000000000a1', 'personal'),
  ('10000000-0000-0000-0000-0000000000e2', 'Also reads Used', '00000000-0000-0000-0000-0000000000a1', 'personal'),
  ('10000000-0000-0000-0000-0000000000e3', 'Gone flow', '00000000-0000-0000-0000-0000000000a1', 'personal');
insert into public.flow_versions (flow_id, version_no, valid_from, status, definition) values
  ('10000000-0000-0000-0000-0000000000e1', 1, '2026-01-01', 'draft', '{"nodes":[{"type":"reference_table","settings":{"table":"Used"}}]}'),
  ('10000000-0000-0000-0000-0000000000e2', 1, '2026-01-01', 'draft', '{"nodes":[{"type":"lookup_join","settings":{"source":{"kind":"reference","table":"used"}}}]}'),
  ('10000000-0000-0000-0000-0000000000e3', 1, '2026-01-01', 'draft', '{"nodes":[{"type":"reference_table","settings":{"table":"OnlyInDeletedFlow"}}]}');
update public.flows set deleted_at = now() where id = '10000000-0000-0000-0000-0000000000e3';

-- a person who is not an admin may not delete, even an unused table
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.delete_ref_table('20000000-0000-0000-0000-0000000000d4')$$, 'P0002', 'Only an admin can delete a reference table. Ask the admin.', 'a user who is not an admin is refused');
reset role;

-- a locked admin changes nothing
select public.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.delete_ref_table('20000000-0000-0000-0000-0000000000d5')$$, 'P0002', null, 'a locked admin is refused');
reset role;
select is((select count(*)::int from public.ref_tables where id in ('20000000-0000-0000-0000-0000000000d4', '20000000-0000-0000-0000-0000000000d5')), 2, 'nothing was deleted by those two');

select public.act_as('00000000-0000-0000-0000-00000000000a');
-- a table that a live flow reads is refused, with the names of the flows (the match ignores the case of the name)
select throws_ok($$select public.delete_ref_table('20000000-0000-0000-0000-0000000000d2')$$, 'P0001',
  'The reference table "Used" is read by Also reads Used, Reads Used. Remove it from those flows first, then delete it.', 'a table in use is refused and the message names the flows');
select is((select count(*)::int from public.ref_tables where id = '20000000-0000-0000-0000-0000000000d2'), 1, 'the table in use is still there');
-- a table that nothing reads goes, with all of its versions
select lives_ok($$select public.delete_ref_table('20000000-0000-0000-0000-0000000000d1')$$, 'the admin deletes a table that no flow reads');
select is((select count(*)::int from public.ref_tables where id = '20000000-0000-0000-0000-0000000000d1'), 0, 'the table is gone');
select is((select count(*)::int from public.ref_table_versions where ref_table_id = '20000000-0000-0000-0000-0000000000d1'), 0, 'and its versions with it');
-- a soft-deleted flow does not keep a table
select lives_ok($$select public.delete_ref_table('20000000-0000-0000-0000-0000000000d3')$$, 'a table that only a deleted flow reads can be deleted');
-- no such table
select throws_ok($$select public.delete_ref_table('20000000-0000-0000-0000-0000000000ff')$$, 'P0002', 'This reference table does not exist. Go back to the Reference tables list.', 'a table that does not exist says so');
-- the table is free after the flows let go of it
update public.flow_versions set definition = '{"nodes":[]}' where flow_id in ('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e2');
select lives_ok($$select public.delete_ref_table('20000000-0000-0000-0000-0000000000d2')$$, 'the table is deleted when no flow reads it any more');
reset role;

select * from finish();
rollback;
