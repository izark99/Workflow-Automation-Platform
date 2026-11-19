-- T4.7f: edited UI texts (SPEC 11.3). One row for each (locale, key) that an admin changed; the rows are applied over
-- the catalog of the app when it starts, so an edit reaches every user without a new deployment.
--
-- Who may do what (decision D74):
--   read   everyone, also a signed-out visitor, so the sign-in screen can show edited texts (they hold no personal data)
--   write  an admin
-- The read policy for `authenticated` is the one that T4.8a narrows to active accounts: a locked user with a valid token
-- must read nothing. `anon` keeps its own policy, so the sign-in screen works for a person with no session.
create table public.ui_texts (
  locale text not null check (locale in ('en', 'vi')),
  key text not null check (key ~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$' and length(key) <= 120),
  value text not null check (length(value) between 1 and 2000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (locale, key)
);

alter table public.ui_texts enable row level security;

revoke all on public.ui_texts from anon, authenticated;
grant select on public.ui_texts to anon;
grant select, insert, update, delete on public.ui_texts to authenticated;

create policy ui_texts_read_anon on public.ui_texts for select to anon using (true);
create policy ui_texts_read on public.ui_texts for select to authenticated using (true);
create policy ui_texts_write on public.ui_texts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Who changed a text, and when, whatever the client sends.
create function public.stamp_ui_text() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

create trigger ui_texts_stamp before insert or update on public.ui_texts
for each row execute function public.stamp_ui_text();
