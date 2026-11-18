-- T3.4: row-level security for ref_tables, ref_table_versions, profiles, groups, group_members, run_log
-- (SPEC section 7). Decision D59.

-- A signed-out visitor (role anon) gets no table at all, on top of having no policy.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- Reference tables: every signed-in user reads them, the admin changes them.
create policy ref_tables_select on public.ref_tables for select to authenticated using (true);
create policy ref_tables_write on public.ref_tables for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy ref_table_versions_select on public.ref_table_versions for select to authenticated using (true);
create policy ref_table_versions_write on public.ref_table_versions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Profiles: a user reads the own row (the app needs the own role); the admin reads and manages all.
-- A user cannot edit the own row, so nobody can make themselves admin.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Users and groups: no access except for the admin.
create policy groups_admin on public.groups for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy group_members_admin on public.group_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Run log: append only. A user logs a run of a flow they can run, as themselves, and reads the own rows;
-- the admin reads all. There is no update and no delete policy (rows go away with their flow by cascade).
create policy run_log_select on public.run_log for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy run_log_insert on public.run_log for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_flow(flow_id));
