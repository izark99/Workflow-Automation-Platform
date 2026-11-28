-- T3.1b: every table of SPEC section 4 exists with its key fields, and row-level security is on.
begin;
select plan(25);

select has_table('public', t, t || ' exists')
from unnest(array['profiles','groups','group_members','flows','flow_versions',
                  'flow_group_access','ref_tables','ref_table_versions','run_log']) as t;

select columns_are('public', 'profiles', array['id','name','email','role','locked_at','must_change_password','max_flows'], 'profiles columns');
select columns_are('public', 'groups', array['id','name'], 'groups columns');
select columns_are('public', 'group_members', array['group_id','user_id'], 'group_members columns');
select columns_are('public', 'flows',
  array['id','name','owner_id','scope','created_at','deleted_at'], 'flows columns');
select columns_are('public', 'flow_versions',
  array['flow_id','version_no','valid_from','valid_to','status','change_note','definition'],
  'flow_versions columns');
select columns_are('public', 'flow_group_access', array['flow_id','group_id'], 'flow_group_access columns');
select columns_are('public', 'ref_tables', array['id','name','description','link_table_id','link_column','key_column'], 'ref_tables columns');
select columns_are('public', 'ref_table_versions',
  array['ref_table_id','version_no','valid_from','valid_to','status','columns','rows'],
  'ref_table_versions columns');
select columns_are('public', 'run_log',
  array['id','flow_id','version_no','user_id','effective_date','run_at','input_rows','output_rows','status'],
  'run_log columns');

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0,
          'row-level security is on for every table in public');

select col_is_pk('public', 'flow_versions', array['flow_id','version_no'], 'flow_versions key');
select col_is_pk('public', 'ref_table_versions', array['ref_table_id','version_no'], 'ref_table_versions key');
select col_is_pk('public', 'group_members', array['group_id','user_id'], 'group_members key');
select col_is_pk('public', 'flow_group_access', array['flow_id','group_id'], 'flow_group_access key');
select col_is_fk('public', 'flows', 'owner_id', 'flows.owner_id is a foreign key');
select col_is_fk('public', 'profiles', 'id', 'profiles.id is a foreign key to auth.users');

select * from finish();
rollback;
