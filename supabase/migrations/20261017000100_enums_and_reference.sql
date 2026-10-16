-- T024: enums and reference tables (data-model.md). RLS on, no policies yet.
create extension if not exists btree_gist;

create type public.app_role as enum ('employee', 'manager', 'admin');
create type public.request_status as enum ('pending', 'approved', 'declined');

-- Shared by regions and profiles: rejects names not in pg_timezone_names.
create function public.assert_valid_timezone(tz text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    raise exception 'invalid_timezone: %', tz using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.assert_valid_timezone(text) from public;

create table public.holiday_regions (
  code text primary key check (code ~ '^[A-Z]{2,5}$'),
  name text not null check (char_length(name) between 1 and 100),
  default_timezone text not null,
  created_at timestamptz not null default now()
);

create function public.holiday_regions_check_tz()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_valid_timezone(new.default_timezone);
  return new;
end;
$$;

create trigger holiday_regions_check_tz
  before insert or update of default_timezone on public.holiday_regions
  for each row execute function public.holiday_regions_check_tz();

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  region_code text not null references public.holiday_regions (code) on delete restrict,
  holiday_date date not null,
  name text not null check (char_length(name) between 1 and 80),
  unique (region_code, holiday_date)
);

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 50),
  is_capped boolean not null,
  default_allowance numeric(5,1) check (default_allowance >= 0),
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  check (is_capped = (default_allowance is not null))
);

alter table public.holiday_regions enable row level security;
alter table public.public_holidays enable row level security;
alter table public.leave_types enable row level security;
