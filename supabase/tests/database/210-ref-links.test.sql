-- Migration 21: linked reference tables (SPEC 16.2). The cases of `supabase/tests/ref-link-cases.json` are written out below, one line
-- or block for each case, with the name of the case as the name of the test; a unit test checks that every case is here.
begin;
select * from no_plan();

create function public.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Removes every table of a case (as the owner of the database, so that nothing but the case is tested).
create function public.clear_ref_tables() returns void language plpgsql as $$
begin
  delete from public.ref_table_link_events;
  update public.ref_tables set link_table_id = null, link_column = null, key_column = null;
  delete from public.ref_tables;
end $$;

insert into auth.users (id, instance_id, aud, role, email)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email
from (values
  ('00000000-0000-0000-0000-00000000000a'::uuid, 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 'locked-admin@example.test'),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'user@example.test')) as u(id, email);
insert into public.profiles (id, name, email, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000b1', 'Locked admin', 'locked-admin@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', 'User', 'user@example.test', 'user')
  on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role;
update public.profiles set locked_at = now() where id = '00000000-0000-0000-0000-0000000000b1';

-- ===== the shared cases: distinct values
select is(public.ref_link_distinct('["  Sản xuất", "Kho", " ", "", "Sản xuất ", null, "QA"]'::jsonb), '["Sản xuất", "Kho", "QA"]'::jsonb, 'distinct values: trims, drops blanks and keeps the first order');
select is(public.ref_link_distinct('["a", "A", "a"]'::jsonb), '["a", "A"]'::jsonb, 'distinct values: case counts');
select is(public.ref_link_distinct('["e", "é", "e"]'::jsonb), '["e", "é"]'::jsonb, 'distinct values: accents count');
select is(public.ref_link_distinct('[1, "1", 2.5, "2.5"]'::jsonb), '["1", "2.5"]'::jsonb, 'distinct values: numbers are written as text');
select is(public.ref_link_distinct('[]'::jsonb), '[]'::jsonb, 'distinct values: an empty column has no values');
select is(public.ref_link_distinct('[null, "", "   "]'::jsonb), '[]'::jsonb, 'distinct values: only blanks has no values');

-- ===== the shared cases: new values
select is(public.ref_link_new_values('["a", "b", "c"]'::jsonb, '["b"]'::jsonb), '["a", "c"]'::jsonb, 'new values: values that B does not hold');
select is(public.ref_link_new_values('["a"]'::jsonb, '["a", "z"]'::jsonb), '[]'::jsonb, 'new values: all held');
select is(public.ref_link_new_values('["A"]'::jsonb, '["a"]'::jsonb), '["A"]'::jsonb, 'new values: case is exact');
select is(public.ref_link_new_values('["x", "y"]'::jsonb, '[]'::jsonb), '["x", "y"]'::jsonb, 'new values: none held');

-- ===== the shared cases: start of the draft
select is(public.ref_link_draft_start('2026-10-01'::date, true, '2026-01-01'::date, null::date, '2026-11-17'::date), '2026-10-01'::date, 'start of the draft: A starts after B''s last version starts');
select is(public.ref_link_draft_start('2026-01-01'::date, true, '2026-01-01'::date, '2026-06-30'::date, '2026-11-17'::date), '2026-07-01'::date, 'start of the draft: A starts the day B''s last version starts: the day after its end');
select is(public.ref_link_draft_start('2025-12-01'::date, true, '2026-01-01'::date, '2026-06-30'::date, '2026-11-17'::date), '2026-07-01'::date, 'start of the draft: A starts before B''s last version: the day after its end');
select is(public.ref_link_draft_start('2026-01-01'::date, true, '2026-01-01'::date, null::date, '2026-11-17'::date), '2026-01-02'::date, 'start of the draft: B''s last version has no end: the day after its start');
select is(public.ref_link_draft_start('2026-10-01'::date, false, null::date, null::date, '2026-11-17'::date), '2026-11-17'::date, 'start of the draft: B has no published version: today');
select is(public.ref_link_draft_start('2028-01-01'::date, true, '2028-01-01'::date, '2028-02-28'::date, '2028-05-05'::date), '2028-02-29'::date, 'start of the draft: the day after the end crosses a month and a leap day');

-- ===== the shared cases: version in effect
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000101', 'v-101');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status) values ('30000000-0000-0000-0000-000000000101', 1, '2026-01-01', '2026-06-30'::date, 'published');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status) values ('30000000-0000-0000-0000-000000000101', 2, '2026-07-01', null::date, 'published');
select is(public.ref_link_version_in_effect('30000000-0000-0000-0000-000000000101', '2026-09-30'::date), 2::integer, 'version in effect: the published version that covers today');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000102', 'v-102');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status) values ('30000000-0000-0000-0000-000000000102', 1, '2026-01-01', null::date, 'published');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status) values ('30000000-0000-0000-0000-000000000102', 2, '2026-07-01', null::date, 'draft');
select is(public.ref_link_version_in_effect('30000000-0000-0000-0000-000000000102', '2026-09-30'::date), 1::integer, 'version in effect: a draft is not used');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000103', 'v-103');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status) values ('30000000-0000-0000-0000-000000000103', 1, '2026-01-01', '2026-03-31'::date, 'published');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status) values ('30000000-0000-0000-0000-000000000103', 2, '2026-04-01', '2026-06-30'::date, 'published');
select is(public.ref_link_version_in_effect('30000000-0000-0000-0000-000000000103', '2026-09-30'::date), 2::integer, 'version in effect: when none covers today, the last published one');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000104', 'v-104');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status) values ('30000000-0000-0000-0000-000000000104', 1, '2026-01-01', null::date, 'draft');
select is(public.ref_link_version_in_effect('30000000-0000-0000-0000-000000000104', '2026-09-30'::date), null::integer, 'version in effect: no published version');
select public.clear_ref_tables();

-- ===== the shared cases: link refusals (the admin links; a refused link says what the case says)
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000105', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000106', 'Costs');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000105', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000106', 1, '2026-01-01', 'draft', '[{"name": "x", "type": "text"}]'::jsonb, '[]'::jsonb);
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.link_ref_table('30000000-0000-0000-0000-000000000106', '30000000-0000-0000-0000-000000000105', 'dept', 'dept')$$, 'link: a link that is allowed');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000107', 'Costs');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000107', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.link_ref_table('30000000-0000-0000-0000-000000000107', '30000000-0000-0000-0000-000000000107', 'dept', 'dept')$$, 'P0001', 'The table "Costs" cannot take its values from itself. Choose another table.', 'link: B to itself');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000108', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000109', 'Costs');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000108', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000109', 1, '2026-01-01', 'draft', '[{"name": "k", "type": "text"}]'::jsonb, '[]'::jsonb);
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000109', link_column = 'k', key_column = 'dept' where id = '30000000-0000-0000-0000-000000000108';
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.link_ref_table('30000000-0000-0000-0000-000000000109', '30000000-0000-0000-0000-000000000108', 'dept', 'k')$$, 'P0001', 'This link would make a cycle: Costs → Departments → Costs. Choose another table, or unlink one of these tables first.', 'link: a cycle of two');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000110', 'A');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000111', 'C');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000112', 'B');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000110', 1, '2026-01-01', 'draft', '[{"name": "c", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000111', 1, '2026-01-01', 'draft', '[{"name": "c", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000112', 1, '2026-01-01', 'draft', '[{"name": "c", "type": "text"}]'::jsonb, '[]'::jsonb);
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000111', link_column = 'c', key_column = 'c' where id = '30000000-0000-0000-0000-000000000110';
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000112', link_column = 'c', key_column = 'c' where id = '30000000-0000-0000-0000-000000000111';
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.link_ref_table('30000000-0000-0000-0000-000000000112', '30000000-0000-0000-0000-000000000110', 'c', 'c')$$, 'P0001', 'This link would make a cycle: B → A → C → B. Choose another table, or unlink one of these tables first.', 'link: a cycle of three');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000113', 'A');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000114', 'B');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000115', 'C');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000113', 1, '2026-01-01', 'draft', '[{"name": "c", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000114', 1, '2026-01-01', 'draft', '[{"name": "c", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000115', 1, '2026-01-01', 'draft', '[{"name": "c", "type": "text"}]'::jsonb, '[]'::jsonb);
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000113', link_column = 'c', key_column = 'c' where id = '30000000-0000-0000-0000-000000000114';
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.link_ref_table('30000000-0000-0000-0000-000000000115', '30000000-0000-0000-0000-000000000114', 'c', 'c')$$, 'link: a chain is allowed');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000116', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000117', 'Costs');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000116', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000117', 1, '2026-01-01', 'draft', '[{"name": "x", "type": "text"}]'::jsonb, '[]'::jsonb);
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.link_ref_table('30000000-0000-0000-0000-000000000117', '30000000-0000-0000-0000-000000000116', 'nope', 'dept')$$, 'P0001', 'The table "Departments" has no column "nope". Choose a column of that table.', 'link: A has no such column');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000118', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000119', 'Teams');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000120', 'Costs');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000118', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000119', 1, '2026-01-01', 'draft', '[{"name": "t", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000120', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000118', link_column = 'dept', key_column = 'dept' where id = '30000000-0000-0000-0000-000000000120';
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.link_ref_table('30000000-0000-0000-0000-000000000120', '30000000-0000-0000-0000-000000000119', 't', 'dept')$$, 'P0001', 'The table "Costs" takes its values from another table already. Unlink it first, then link it again.', 'link: B is linked already');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000121', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000122', 'Costs');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000121', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000122', 1, '2026-01-01', 'draft', '[{"name": "x", "type": "text"}]'::jsonb, '[]'::jsonb);
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.link_ref_table('30000000-0000-0000-0000-000000000122', '30000000-0000-0000-0000-000000000121', 'dept', '  ')$$, 'P0001', 'The key column of "Costs" has no name. Type the name of the column that holds the values.', 'link: the key column has no name');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000123', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000124', 'Costs');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000123', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000124', 1, '2026-01-01', 'draft', '[{"name": "limit", "type": "number"}]'::jsonb, '[]'::jsonb);
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.link_ref_table('30000000-0000-0000-0000-000000000124', '30000000-0000-0000-0000-000000000123', 'dept', 'limit')$$, 'P0001', 'The column "limit" of "Costs" is not a text column. Choose a text column, or type a new name.', 'link: the key column exists and is not text');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000125', 'A');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000126', 'B1');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000127', 'B2');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000125', 1, '2026-01-01', 'draft', '[{"name": "c", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000126', 1, '2026-01-01', 'draft', '[{"name": "c", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000127', 1, '2026-01-01', 'draft', '[{"name": "c", "type": "text"}]'::jsonb, '[]'::jsonb);
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000125', link_column = 'c', key_column = 'c' where id = '30000000-0000-0000-0000-000000000126';
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.link_ref_table('30000000-0000-0000-0000-000000000127', '30000000-0000-0000-0000-000000000125', 'c', 'c')$$, 'link: A can feed several tables');
reset role;
select public.clear_ref_tables();

-- ===== the shared cases: publish of A without a linked column
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000128', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000129', 'Costs');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000128', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000129', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000128', link_column = 'dept', key_column = 'dept' where id = '30000000-0000-0000-0000-000000000129';
update public.ref_table_versions set columns = '[{"name": "dept", "type": "text"}, {"name": "note", "type": "text"}]'::jsonb where ref_table_id = '30000000-0000-0000-0000-000000000128';
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.publish_ref_table_version('30000000-0000-0000-0000-000000000128', 1)$$, 'publish of A: the version keeps the linked column');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000130', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000131', 'Costs');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000132', 'Budgets');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000130', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000131', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000132', 1, '2026-01-01', 'draft', '[{"name": "d", "type": "text"}]'::jsonb, '[]'::jsonb);
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000130', link_column = 'dept', key_column = 'dept' where id = '30000000-0000-0000-0000-000000000131';
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000130', link_column = 'dept', key_column = 'd' where id = '30000000-0000-0000-0000-000000000132';
update public.ref_table_versions set columns = '[{"name": "note", "type": "text"}]'::jsonb where ref_table_id = '30000000-0000-0000-0000-000000000130';
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.publish_ref_table_version('30000000-0000-0000-0000-000000000130', 1)$$, 'P0001', 'This version of "Departments" has no column "dept", which Budgets, Costs take their values from. Add the column back, or unlink those tables first.', 'publish of A: the version lacks the linked column and names the tables');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000133', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000134', 'Costs');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000133', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000134', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000133', link_column = 'code', key_column = 'dept' where id = '30000000-0000-0000-0000-000000000134';
update public.ref_table_versions set columns = '[{"name": "dept", "type": "text"}]'::jsonb where ref_table_id = '30000000-0000-0000-0000-000000000133';
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.publish_ref_table_version('30000000-0000-0000-0000-000000000133', 1)$$, 'P0001', 'This version of "Departments" has no column "code", which Costs take their values from. Add the column back, or unlink those tables first.', 'publish of A: a table linked to another column is not named');
reset role;
select public.clear_ref_tables();

-- ===== the shared cases: delete
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000135', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000136', 'Costs');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000135', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000136', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.delete_ref_table('30000000-0000-0000-0000-000000000135')$$, 'delete: no table is linked');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000137', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000138', 'Costs');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000139', 'Budgets');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000137', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000138', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000139', 1, '2026-01-01', 'draft', '[{"name": "d", "type": "text"}]'::jsonb, '[]'::jsonb);
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000137', link_column = 'dept', key_column = 'dept' where id = '30000000-0000-0000-0000-000000000138';
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000137', link_column = 'dept', key_column = 'd' where id = '30000000-0000-0000-0000-000000000139';
select public.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.delete_ref_table('30000000-0000-0000-0000-000000000137')$$, 'P0001', 'The table "Departments" gives its values to Budgets, Costs. Unlink those tables first, then delete it.', 'delete: tables are linked and are named');
reset role;
select public.clear_ref_tables();
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000140', 'Departments');
insert into public.ref_tables (id, name) values ('30000000-0000-0000-0000-000000000141', 'Costs');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000140', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values ('30000000-0000-0000-0000-000000000141', 1, '2026-01-01', 'draft', '[{"name": "dept", "type": "text"}]'::jsonb, '[]'::jsonb);
update public.ref_tables set link_table_id = '30000000-0000-0000-0000-000000000140', link_column = 'dept', key_column = 'dept' where id = '30000000-0000-0000-0000-000000000141';
select public.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.delete_ref_table('30000000-0000-0000-0000-000000000141')$$, 'delete: deleting B, which is linked, is not refused');
reset role;
select public.clear_ref_tables();

-- ===== the scenarios: link, cascade, notice, chain, atomic publish, rights, grants
insert into public.ref_tables (id, name) values
  ('40000000-0000-0000-0000-000000000001', 'Departments'),
  ('40000000-0000-0000-0000-000000000002', 'Costs'),
  ('40000000-0000-0000-0000-000000000003', 'Budgets');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, valid_to, status, columns, rows) values
  ('40000000-0000-0000-0000-000000000001', 1, '2026-01-01', null, 'published', '[{"name":"dept","type":"text"},{"name":"note","type":"text"}]', '[["Kho","x"],[" QA ","y"],["Kho","z"],["","w"]]'),
  ('40000000-0000-0000-0000-000000000002', 1, '2026-01-01', null, 'published', '[{"name":"dept","type":"text"},{"name":"limit","type":"number"}]', '[]'),
  ('40000000-0000-0000-0000-000000000003', 1, '2026-01-01', null, 'published', '[{"name":"dept","type":"text"}]', '[]');

-- a user who is not an admin may not link or unlink; nor may a locked admin
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.link_ref_table('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'dept', 'dept')$$, 'P0002', 'Only an admin can link reference tables. Ask the admin.', 'a user who is not an admin cannot link');
select throws_ok($$select public.unlink_ref_table('40000000-0000-0000-0000-000000000002')$$, 'P0002', 'Only an admin can link reference tables. Ask the admin.', 'a user who is not an admin cannot unlink');
reset role;
select public.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.link_ref_table('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'dept', 'dept')$$, 'P0002', null, 'a locked admin cannot link');
reset role;
select is((select link_table_id from public.ref_tables where id = '40000000-0000-0000-0000-000000000002'), null, 'nothing was linked by those');

select public.act_as('00000000-0000-0000-0000-00000000000a');
-- the table that does not exist, and a source that does not exist
select throws_ok($$select public.link_ref_table('40000000-0000-0000-0000-0000000000ff', '40000000-0000-0000-0000-000000000001', 'dept', 'dept')$$, 'P0002', 'This reference table does not exist. Go back to the Reference tables list.', 'a table that does not exist says so');
select throws_ok($$select public.link_ref_table('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-0000000000ff', 'dept', 'dept')$$, 'P0002', 'The table to take the values from does not exist any more. Choose another table.', 'a source that does not exist says so');

-- link: B gets a draft with the distinct values of the version of A in effect today, the other columns empty, and an open notice
select lives_ok($$select public.link_ref_table('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'dept', 'dept')$$, 'the admin links Costs to Departments');
select is((select row(link_table_id, link_column, key_column)::text from public.ref_tables where id = '40000000-0000-0000-0000-000000000002'), '(40000000-0000-0000-0000-000000000001,dept,dept)', 'the link is stored');
select is((select rows from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000002' and version_no = 2), '[["Kho", null], ["QA", null]]'::jsonb, 'the draft of B holds the distinct trimmed values, the other column empty');
select is((select status || ' ' || valid_from::text from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000002' and version_no = 2), 'draft ' || current_date::text, 'the draft starts today, which is after the start of the published version');
select is((select new_values from public.ref_table_link_events where ref_table_id = '40000000-0000-0000-0000-000000000002' and closed_at is null), '["Kho", "QA"]'::jsonb, 'B has an open notice with the values');
select is((select draft_version_no from public.ref_table_link_events where ref_table_id = '40000000-0000-0000-0000-000000000002' and closed_at is null), 2, 'the notice names the draft');

-- the notice closes when the draft is published
select lives_ok($$select public.publish_ref_table_version('40000000-0000-0000-0000-000000000002', 2)$$, 'the admin publishes the draft of B');
select is((select count(*)::int from public.ref_table_link_events where ref_table_id = '40000000-0000-0000-0000-000000000002' and closed_at is null), 0, 'the notice is closed');

-- a draft of A changes nothing in B
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values
  ('40000000-0000-0000-0000-000000000001', 2, '2099-01-01', 'draft', '[{"name":"dept","type":"text"},{"name":"note","type":"text"}]', '[["Kho","x"],["Vận chuyển","y"],[" Vận chuyển","y"]]');
select is((select count(*)::int from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000002'), 2, 'a draft of A does not give B a draft');

-- a published version of A gives the new values to the draft of B, which is a copy of the last published version; B is not published
select lives_ok($$select public.publish_ref_table_version('40000000-0000-0000-0000-000000000001', 2)$$, 'the admin publishes a version of A with a new value');
select is((select rows from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000002' and version_no = 3), '[["Kho", null], ["QA", null], ["Vận chuyển", null]]'::jsonb, 'B has a draft with its rows and the new value; the value that left A stays');
select is((select status || ' ' || valid_from::text from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000002' and version_no = 3), 'draft 2099-01-01', 'the draft starts the day the version of A starts');
select is((select new_values from public.ref_table_link_events where ref_table_id = '40000000-0000-0000-0000-000000000002' and closed_at is null), '["Vận chuyển"]'::jsonb, 'the open notice holds the new value');
select is((select count(*)::int from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000002' and status = 'published'), 2, 'B was not published by it: its two published versions are those of before');

-- a chain: C takes its values from B (the version in effect today), then a publish of A updates both drafts
select lives_ok($$select public.link_ref_table('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'dept', 'dept')$$, 'a chain is allowed: Budgets takes its values from Costs');
select is((select rows from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000003' and version_no = 2), '[["Kho"], ["QA"]]'::jsonb, 'C got the values of the published version of B');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values
  ('40000000-0000-0000-0000-000000000001', 3, '2099-06-01', 'draft', '[{"name":"dept","type":"text"},{"name":"note","type":"text"}]', '[["Kho","x"],["IT","y"]]');
select lives_ok($$select public.publish_ref_table_version('40000000-0000-0000-0000-000000000001', 3)$$, 'the next version of A is published');
select is((select rows from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000002' and version_no = 3), '[["Kho", null], ["QA", null], ["Vận chuyển", null], ["IT", null]]'::jsonb, 'the draft of B got IT');
select is((select rows from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000003' and version_no = 2), '[["Kho"], ["QA"], ["Vận chuyển"], ["IT"]]'::jsonb, 'and the draft of C, in the same publish, got the values of the draft of B');
select is((select count(*)::int from public.ref_table_versions where ref_table_id in ('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003') and status = 'published'), 3, 'nothing of the chain was published: the published versions are those of before');
select is((select count(*)::int from public.ref_table_link_events where closed_at is null), 2, 'B and C each have one open notice');

-- unlink: B keeps its rows, its notice closes, and a later publish of A does not touch it
select throws_ok($$select public.unlink_ref_table('40000000-0000-0000-0000-000000000001')$$, 'P0001', 'This table is not linked to another table. Reload the page.', 'a table that is not linked cannot be unlinked');
select lives_ok($$select public.unlink_ref_table('40000000-0000-0000-0000-000000000003')$$, 'the admin unlinks Budgets');
select is((select link_table_id from public.ref_tables where id = '40000000-0000-0000-0000-000000000003'), null, 'the link is gone');
select is((select jsonb_array_length(rows) from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000003' and version_no = 2), 4, 'and its rows stay');
select is((select count(*)::int from public.ref_table_link_events where ref_table_id = '40000000-0000-0000-0000-000000000003' and closed_at is null), 0, 'and its notice is closed');

-- Departments feeds Costs: it cannot be deleted, and the message names the table
select throws_ok($$select public.delete_ref_table('40000000-0000-0000-0000-000000000001')$$, 'P0001', 'The table "Departments" gives its values to Costs. Unlink those tables first, then delete it.', 'a source that feeds a table cannot be deleted');
-- a publish without the linked column is refused and nothing changes
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values
  ('40000000-0000-0000-0000-000000000001', 4, '2099-07-01', 'draft', '[{"name":"note","type":"text"}]', '[["x"]]');
select throws_ok($$select public.publish_ref_table_version('40000000-0000-0000-0000-000000000001', 4)$$, 'P0001', 'This version of "Departments" has no column "dept", which Costs take their values from. Add the column back, or unlink those tables first.', 'a version without the linked column is refused');
select is((select status from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000001' and version_no = 4), 'draft', 'and it stays a draft');

-- the publish of A and the update of B are one transaction: a draft of B that cannot take the new value stops the publish too
insert into public.ref_tables (id, name, link_table_id, link_column, key_column) values
  ('40000000-0000-0000-0000-000000000011', 'Source2', null, null, null);
insert into public.ref_tables (id, name, link_table_id, link_column, key_column) values
  ('40000000-0000-0000-0000-000000000012', 'Full', '40000000-0000-0000-0000-000000000011', 'dept', 'dept');
insert into public.ref_table_versions (ref_table_id, version_no, valid_from, status, columns, rows) values
  ('40000000-0000-0000-0000-000000000011', 1, '2026-01-01', 'draft', '[{"name":"dept","type":"text"}]', '[["zz"]]'),
  ('40000000-0000-0000-0000-000000000012', 1, '2026-01-01', 'draft', '[{"name":"dept","type":"text"}]', (select jsonb_agg(jsonb_build_array('k' || i)) from generate_series(1, 50000) i));
select throws_ok($$select public.publish_ref_table_version('40000000-0000-0000-0000-000000000011', 1)$$, '23514', null, 'a publish that would make B too big fails');
select is((select status from public.ref_table_versions where ref_table_id = '40000000-0000-0000-0000-000000000011' and version_no = 1), 'draft', 'and A was not published either');
reset role;

-- the constraints of the link
select throws_ok($$update public.ref_tables set link_table_id = id, link_column = 'x', key_column = 'x' where id = '40000000-0000-0000-0000-000000000003'$$, '23514', null, 'a table cannot be linked to itself');
select throws_ok($$update public.ref_tables set link_column = 'x' where id = '40000000-0000-0000-0000-000000000003'$$, '23514', null, 'a link has all three parts or none');

-- the notices are for the admin
select public.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.ref_table_link_events), 0, 'a user sees no notice');
select throws_ok($$insert into public.ref_table_link_events (ref_table_id, source_table_id, link_column, draft_version_no) values ('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'dept', 1)$$, '42501', null, 'a user cannot write a notice');
reset role;
select public.act_as('00000000-0000-0000-0000-00000000000a');
select cmp_ok((select count(*)::int from public.ref_table_link_events), '>', 0, 'the admin sees the notices');
-- deleting B drops its link and its notices
select lives_ok($$select public.delete_ref_table('40000000-0000-0000-0000-000000000002')$$, 'deleting B works as before');
select is((select count(*)::int from public.ref_table_link_events where ref_table_id = '40000000-0000-0000-0000-000000000002'), 0, 'and drops its notices');
reset role;

-- grants: nothing is callable by anon; the admin functions are for signed-in users
select ok(not has_function_privilege('anon', 'public.link_ref_table(uuid,uuid,text,text)', 'execute'), 'anon cannot link');
select ok(not has_function_privilege('anon', 'public.unlink_ref_table(uuid)', 'execute'), 'anon cannot unlink');
select ok(not has_function_privilege('anon', 'public.ref_link_feed(uuid,jsonb,jsonb,date)', 'execute'), 'anon cannot call the cascade');
select ok(not has_function_privilege('anon', 'public.ref_link_add_values(uuid,jsonb,date,uuid)', 'execute'), 'anon cannot add values');
select ok(not has_function_privilege('anon', 'public.publish_ref_table_version(uuid,integer)', 'execute'), 'anon cannot publish');
select ok(not has_function_privilege('anon', 'public.delete_ref_table(uuid)', 'execute'), 'anon cannot delete a table');
select ok(has_function_privilege('authenticated', 'public.link_ref_table(uuid,uuid,text,text)', 'execute'), 'a signed-in user may call link (the function refuses a user who is not an admin)');
select ok(not has_table_privilege('anon', 'public.ref_table_link_events', 'select'), 'anon cannot read the notices');

select * from finish();
rollback;
