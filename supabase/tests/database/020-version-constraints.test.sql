-- T3.2: no overlap, published versions read-only, row cap, publish functions.
-- Runs as the table owner, so row-level security does not interfere: this file tests constraints only.
begin;
select plan(29);

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'owner@example.test');
insert into public.profiles (id, name, email, role)
values ('00000000-0000-0000-0000-0000000000b1', 'Owner', 'owner@example.test', 'admin')
  on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role;
insert into public.flows (id, name, owner_id) values
  ('10000000-0000-0000-0000-000000000001', 'Flow A', '00000000-0000-0000-0000-0000000000b1'),
  ('10000000-0000-0000-0000-000000000002', 'Flow B', '00000000-0000-0000-0000-0000000000b1');
insert into public.ref_tables (id, name) values ('20000000-0000-0000-0000-000000000001', 'Limits');

-- Flow versions: no overlap among published versions
insert into public.flow_versions (flow_id, version_no, valid_from, valid_to, status, definition) values
  ('10000000-0000-0000-0000-000000000001', 1, '2026-01-01', '2026-06-30', 'published', '{}');

select throws_ok($$insert into public.flow_versions (flow_id, version_no, valid_from, valid_to, status, definition)
  values ('10000000-0000-0000-0000-000000000001', 2, '2026-06-30', '2026-12-31', 'published', '{}')$$,
  '23P01', null, 'published versions that share one day are refused');
select throws_ok($$insert into public.flow_versions (flow_id, version_no, valid_from, valid_to, status, definition)
  values ('10000000-0000-0000-0000-000000000001', 2, '2025-01-01', null, 'published', '{}')$$,
  '23P01', null, 'an open-ended published version that covers an earlier one is refused');
select lives_ok($$insert into public.flow_versions (flow_id, version_no, valid_from, valid_to, status, definition)
  values ('10000000-0000-0000-0000-000000000001', 2, '2026-07-01', null, 'published', '{}')$$,
  'the next day is allowed');
select lives_ok($$insert into public.flow_versions (flow_id, version_no, valid_from, valid_to, status, definition)
  values ('10000000-0000-0000-0000-000000000001', 3, '2026-03-01', '2026-03-31', 'draft', '{}')$$,
  'a draft may overlap a published version');
select lives_ok($$insert into public.flow_versions (flow_id, version_no, valid_from, valid_to, status, definition)
  values ('10000000-0000-0000-0000-000000000002', 1, '2026-01-01', null, 'published', '{}')$$,
  'another flow has its own dates');
select throws_ok($$insert into public.flow_versions (flow_id, version_no, valid_from, valid_to, status, definition)
  values ('10000000-0000-0000-0000-000000000002', 2, '2026-05-01', '2026-04-01', 'draft', '{}')$$,
  '23514', null, 'valid_to before valid_from is refused');

-- Published versions are read-only
select throws_ok($$update public.flow_versions set definition = '{"x":1}'
  where flow_id = '10000000-0000-0000-0000-000000000001' and version_no = 1$$,
  'P0001', null, 'a published definition cannot change');
select throws_ok($$update public.flow_versions set valid_from = '2026-01-02'
  where flow_id = '10000000-0000-0000-0000-000000000001' and version_no = 1$$,
  'P0001', null, 'a published start day cannot change');
select throws_ok($$update public.flow_versions set valid_to = '2026-06-29'
  where flow_id = '10000000-0000-0000-0000-000000000001' and version_no = 1$$,
  'P0001', null, 'a published end day cannot change directly');
select throws_ok($$update public.flow_versions set status = 'draft'
  where flow_id = '10000000-0000-0000-0000-000000000001' and version_no = 1$$,
  'P0001', null, 'a published version cannot go back to draft');
select throws_ok($$delete from public.flow_versions
  where flow_id = '10000000-0000-0000-0000-000000000001' and version_no = 1$$,
  'P0001', null, 'a published version cannot be deleted directly');
select lives_ok($$update public.flow_versions set definition = '{"x":1}', change_note = 'edit'
  where flow_id = '10000000-0000-0000-0000-000000000001' and version_no = 3$$,
  'a draft can change');
select lives_ok($$delete from public.flow_versions
  where flow_id = '10000000-0000-0000-0000-000000000001' and version_no = 3$$,
  'a draft can be deleted');

-- Publish function: ends the previous open-ended version, in one call
insert into public.flow_versions (flow_id, version_no, valid_from, status, definition)
values ('10000000-0000-0000-0000-000000000001', 4, '2026-10-01', 'draft', '{}');
select lives_ok($$select public.publish_flow_version('10000000-0000-0000-0000-000000000001', 4)$$,
  'publish a draft that starts after an open-ended version');
select is((select valid_to from public.flow_versions
           where flow_id = '10000000-0000-0000-0000-000000000001' and version_no = 2), date '2026-09-30',
  'the previous open-ended version ends the day before');
select is((select status from public.flow_versions
           where flow_id = '10000000-0000-0000-0000-000000000001' and version_no = 4), 'published',
  'the draft is published');
select throws_ok($$select public.publish_flow_version('10000000-0000-0000-0000-000000000001', 4)$$,
  'P0001', null, 'a version that is already published cannot be published again');
insert into public.flow_versions (flow_id, version_no, valid_from, status, definition)
values ('10000000-0000-0000-0000-000000000001', 5, '2026-09-01', 'draft', '{}');
select throws_ok($$select public.publish_flow_version('10000000-0000-0000-0000-000000000001', 5)$$,
  '23P01', null, 'a draft that would overlap a published version is refused');
select throws_ok($$select public.publish_flow_version('10000000-0000-0000-0000-000000000001', 99)$$,
  'P0002', null, 'a missing version is refused');

-- A purge of the flow still removes its published versions (cascade)
select lives_ok($$delete from public.flows where id = '10000000-0000-0000-0000-000000000002'$$,
  'deleting a flow removes its published versions');

-- Reference table versions: same rules and the row cap
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows)
values ('20000000-0000-0000-0000-000000000001', 1, '2026-01-01', 'published', '[]', '[]');
select throws_ok($$insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status)
  values ('20000000-0000-0000-0000-000000000001', 2, '2026-03-01', '2026-03-31', 'published')$$,
  '23P01', null, 'reference table versions do not overlap');
select throws_ok($$update public.ref_table_versions set rows = '[[1]]'
  where ref_table_id = '20000000-0000-0000-0000-000000000001' and version_no = 1$$,
  'P0001', null, 'a published reference table version is read-only');
select lives_ok($$insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, rows)
  values ('20000000-0000-0000-0000-000000000001', 2, '2026-07-01', 'draft',
          (select jsonb_agg(jsonb_build_array(g)) from generate_series(1, 50000) g))$$,
  'a version with 50,000 rows is allowed');
select throws_ok($$update public.ref_table_versions
  set rows = (select jsonb_agg(jsonb_build_array(g)) from generate_series(1, 50001) g)
  where ref_table_id = '20000000-0000-0000-0000-000000000001' and version_no = 2$$,
  '23514', null, 'a version with 50,001 rows is refused');
select lives_ok($$select public.publish_ref_table_version('20000000-0000-0000-0000-000000000001', 2)$$,
  'publish a reference table version');
select is((select valid_to from public.ref_table_versions
           where ref_table_id = '20000000-0000-0000-0000-000000000001' and version_no = 1), date '2026-06-30',
  'the previous reference table version ends the day before');
select is((select status from public.ref_table_versions
           where ref_table_id = '20000000-0000-0000-0000-000000000001' and version_no = 2), 'published',
  'the reference table draft is published');
select throws_ok($$select public.publish_ref_table_version('20000000-0000-0000-0000-000000000001', 2)$$,
  'P0001', null, 'a reference table version cannot be published twice');
select lives_ok($$delete from public.ref_tables where id = '20000000-0000-0000-0000-000000000001'$$,
  'deleting a reference table removes its published versions');

select * from finish();
rollback;
