-- T5.10: settings that the admin sets for everyone (SPEC 12.2). The first is `idle_timeout_hours`, the hours without
-- activity after which the browser signs a user out.
--
-- Who may do what:
--   read   every signed-in, active user (the app reads the limit after sign-in and every 15 minutes)
--   write  an active admin (`is_admin()` is false for a locked account since migration 11)
--   anon   nothing: the limit is for signed-in people, and a visitor has no use for it
-- A restrictive policy keeps a locked user with a valid token out of the table, like the other tables (migration 11).
create table public.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$' and length(key) <= 60),
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- idle_timeout_hours is a whole number from 1 to 72. A text such as "8" is refused: the check looks at the JSON type first.
  constraint idle_timeout_hours_valid check (
    key <> 'idle_timeout_hours'
    or case
      when jsonb_typeof(value) = 'number'
        then (value #>> '{}')::numeric = trunc((value #>> '{}')::numeric) and (value #>> '{}')::numeric between 1 and 72
      else false
    end
  )
);

alter table public.app_settings enable row level security;

revoke all on public.app_settings from anon, authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;

create policy app_settings_read on public.app_settings for select to authenticated using (true);
create policy app_settings_write on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy app_settings_active_only on public.app_settings as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- Who changed a setting, and when, whatever the client sends (like ui_texts). Not callable as a function (D82).
create function public.stamp_app_setting() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

revoke execute on function public.stamp_app_setting() from public, anon, authenticated;

create trigger app_settings_stamp before insert or update on public.app_settings
for each row execute function public.stamp_app_setting();

insert into public.app_settings (key, value) values ('idle_timeout_hours', '8'::jsonb);
