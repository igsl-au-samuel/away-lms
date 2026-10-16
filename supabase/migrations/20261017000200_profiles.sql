-- T025: profiles, 1:1 with auth.users. RLS on, no policies yet.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 100),
  email text not null unique check (email = lower(email)),
  role public.app_role not null default 'employee',
  region_code text not null references public.holiday_regions (code),
  timezone text not null,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (not is_demo or role = 'employee')
);

-- Default the timezone from the region, then validate it.
create function public.profiles_set_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timezone is null then
    select default_timezone into new.timezone
    from public.holiday_regions where code = new.region_code;
  end if;
  perform public.assert_valid_timezone(new.timezone);
  return new;
end;
$$;

-- BEFORE triggers run before NOT NULL is checked, so the default fills in time.
create trigger profiles_set_timezone
  before insert or update of region_code, timezone on public.profiles
  for each row execute function public.profiles_set_timezone();

alter table public.profiles enable row level security;

revoke update on public.profiles from authenticated;
grant update (region_code, timezone) on public.profiles to authenticated;
