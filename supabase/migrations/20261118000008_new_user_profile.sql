-- T3.7a: a profile appears when an Auth user is created (decision D66).
-- The role is always 'user'. The metadata of a user is editable by that user at sign-up, so it never decides the role.
-- The first admin is made by one SQL step described in docs/DEPLOY.md; after that the admin changes roles on the Admin screen.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A phone-only user has no email and so no profile. An email that a profile already uses (ignoring case) must not
  -- stop the Auth user from being created: the user then has no profile, and the app says so.
  if new.email is null then
    return new;
  end if;
  insert into public.profiles (id, name, email, role)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
          new.email,
          'user')
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
