-- T4.8a: locking an account (SPEC 11.1, decision D75).
--
-- A locked user has a valid token for a while after the lock (an Auth ban stops new sign-ins and refreshes, not a token
-- that is already in use). So the database itself refuses a locked user: every table has a RESTRICTIVE policy that
-- requires an active account, and the helpers that other policies use require it too. The restrictive policies are for
-- `authenticated` only, so a visitor with no session (`anon`) still reads ui_texts, as D74 promises.
--
--   locked_at              set when an admin locks the account; null for an active account
--   must_change_password   set when an admin creates the account or resets the password
-- Both columns change only through the functions below, which the Edge Function `admin-users` calls with the service role.

alter table public.profiles
  add column locked_at timestamptz,
  add column must_change_password boolean not null default false;

-- Security definer, empty search_path and stable, like is_admin(): the restrictive policy on profiles would
-- otherwise recurse into itself.
create function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and locked_at is null);
$$;

-- Every admin check in the policies and functions of the earlier migrations goes through is_admin(): an admin whose
-- account is locked is not an admin any more.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and locked_at is null);
$$;

revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

-- One restrictive policy for each table: with the permissive policies of T3.3, T3.4 and T4.7f it means
-- "the permissive rule AND an active account".
create policy flows_active_only on public.flows as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy flow_versions_active_only on public.flow_versions as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy flow_group_access_active_only on public.flow_group_access as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy ref_tables_active_only on public.ref_tables as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy ref_table_versions_active_only on public.ref_table_versions as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy profiles_active_only on public.profiles as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy groups_active_only on public.groups as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy group_members_active_only on public.group_members as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy run_log_active_only on public.run_log as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy ui_texts_active_only on public.ui_texts as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- Row-level security does not apply inside a security definer function, so this one checks for itself.
create or replace function public.visible_names() returns table (kind text, id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select 'user'::text, p.id, p.name from public.profiles p
   where public.is_active_user()
     and exists (select 1 from public.flows f where f.owner_id = p.id and public.can_view_flow(f.id))
  union all
  select 'group'::text, g.id, g.name from public.groups g
   where public.is_active_user()
     and exists (select 1 from public.flow_group_access a where a.group_id = g.id and public.can_view_flow(a.flow_id));
$$;

-- At least one ACTIVE admin must remain: one rule for demoting, deleting and locking the last one.
create or replace function public.guard_last_admin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role = 'admin' and old.locked_at is null
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.locked_at is not null)
     and not exists (select 1 from public.profiles where role = 'admin' and locked_at is null and id <> old.id) then
    raise exception 'At least one active admin is needed. Make another user an admin first, then change this user.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- The two account columns change only inside the functions below (they run as their owner) or with the service role.
-- Without this, the admin policy of T3.4 would let an admin set or clear them with a plain update and so bypass the ban in Auth.
create function public.guard_account_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.locked_at is not null or new.must_change_password
          or (tg_op = 'UPDATE' and (new.locked_at is distinct from old.locked_at or new.must_change_password is distinct from old.must_change_password))) then
    raise exception 'The lock and the password flag of an account change only through the admin-users function.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard_account_columns before insert or update on public.profiles
  for each row execute function public.guard_account_columns();

-- Lock or unlock. `p_actor` is the admin who asked, as the Edge Function read it from the token. Service role only.
create function public.admin_set_locked(p_actor uuid, p_user uuid, p_locked boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and locked_at is null) then
    raise exception 'Only an active admin can lock or unlock an account. Ask the admin.' using errcode = '42501';
  end if;
  if p_locked and p_actor = p_user then
    raise exception 'You cannot lock your own account. Ask another admin.' using errcode = '22023';
  end if;
  update public.profiles
     set locked_at = case when p_locked then coalesce(locked_at, now()) else null end
   where id = p_user;
  if not found then
    raise exception 'This user does not exist any more. Reload the page.' using errcode = 'P0002';
  end if;
end $$;

-- Set or clear "must change password" for another user. Service role only.
create function public.admin_set_must_change_password(p_actor uuid, p_user uuid, p_value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and locked_at is null) then
    raise exception 'Only an active admin can change this. Ask the admin.' using errcode = '42501';
  end if;
  update public.profiles set must_change_password = p_value where id = p_user;
  if not found then
    raise exception 'This user does not exist any more. Reload the page.' using errcode = 'P0002';
  end if;
end $$;

-- The user clears the flag on the own row after choosing a new password.
create function public.clear_must_change_password() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then
    raise exception 'This account is locked. Ask the admin.' using errcode = '42501';
  end if;
  update public.profiles set must_change_password = false where id = auth.uid();
end $$;

-- What the app may learn about the own account even when it is locked: only these two facts.
create function public.account_status() returns table (locked boolean, must_change_password boolean)
language sql stable security definer set search_path = '' as $$
  select p.locked_at is not null, p.must_change_password from public.profiles p where p.id = auth.uid();
$$;

revoke execute on function public.admin_set_locked(uuid, uuid, boolean), public.admin_set_must_change_password(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_locked(uuid, uuid, boolean), public.admin_set_must_change_password(uuid, uuid, boolean)
  to service_role;
revoke execute on function public.clear_must_change_password(), public.account_status() from public, anon;
grant execute on function public.clear_must_change_password(), public.account_status() to authenticated;
revoke execute on function public.guard_account_columns() from public, anon, authenticated;
