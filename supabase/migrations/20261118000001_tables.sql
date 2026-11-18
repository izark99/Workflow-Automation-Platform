-- T3.1b: tables of SPEC section 4.
-- Row-level security is switched on here with no policies, so every table is closed until
-- T3.3 and T3.4 add the policies. Constraints on versions come in T3.2.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user'))
);
create unique index profiles_email_key on public.profiles (lower(email));

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0)
);
create unique index groups_name_key on public.groups (lower(name));

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.flows (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  owner_id uuid not null references public.profiles (id),
  scope text not null default 'personal' check (scope in ('personal', 'shared')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index flows_owner_idx on public.flows (owner_id);

create table public.flow_versions (
  flow_id uuid not null references public.flows (id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  valid_from date not null,
  valid_to date,
  status text not null default 'draft' check (status in ('draft', 'published')),
  change_note text not null default '',
  definition jsonb not null,
  primary key (flow_id, version_no),
  check (valid_to is null or valid_to >= valid_from)
);

create table public.flow_group_access (
  flow_id uuid not null references public.flows (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  primary key (flow_id, group_id)
);
create index flow_group_access_group_idx on public.flow_group_access (group_id);

create table public.ref_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  description text not null default ''
);
create unique index ref_tables_name_key on public.ref_tables (lower(name));

create table public.ref_table_versions (
  ref_table_id uuid not null references public.ref_tables (id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  valid_from date not null,
  valid_to date,
  status text not null default 'draft' check (status in ('draft', 'published')),
  columns jsonb not null default '[]'::jsonb check (jsonb_typeof(columns) = 'array'),
  rows jsonb not null default '[]'::jsonb check (jsonb_typeof(rows) = 'array'),
  primary key (ref_table_id, version_no),
  check (valid_to is null or valid_to >= valid_from)
);

-- Metadata only: no input data, no file names, no cell values.
create table public.run_log (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null,
  version_no integer not null,
  user_id uuid not null references public.profiles (id),
  effective_date date not null,
  run_at timestamptz not null default now(),
  input_rows integer not null default 0 check (input_rows >= 0),
  output_rows integer not null default 0 check (output_rows >= 0),
  status text not null check (status in ('ok', 'failed')),
  foreign key (flow_id, version_no) references public.flow_versions (flow_id, version_no) on delete cascade
);
create index run_log_flow_idx on public.run_log (flow_id, run_at desc);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.flows enable row level security;
alter table public.flow_versions enable row level security;
alter table public.flow_group_access enable row level security;
alter table public.ref_tables enable row level security;
alter table public.ref_table_versions enable row level security;
alter table public.run_log enable row level security;
