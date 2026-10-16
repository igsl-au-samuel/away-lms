-- T026: leave requests and allowances. RLS on, no policies yet.
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id),
  start_date date not null,
  end_date date not null,
  region_code text not null references public.holiday_regions (code),
  working_days numeric(5,1) not null check (working_days > 0),
  over_balance_days numeric(5,1) check (over_balance_days > 0),
  note text check (char_length(note) <= 500),
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_comment text check (char_length(decision_comment) <= 500),
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (extract(year from start_date) = extract(year from end_date)),
  check ((status = 'pending') = (decided_by is null and decided_at is null)),
  check (decided_by <> user_id),
  exclude using gist (
    user_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'approved'))
);

create table public.allowance_overrides (
  user_id uuid not null references public.profiles (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id),
  year smallint not null check (year between 2000 and 2100),
  days numeric(5,1) not null check (days >= 0),
  primary key (user_id, leave_type_id, year)
);

create table public.allowance_changes (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id),
  year smallint,
  old_days numeric(5,1),
  new_days numeric(5,1),
  changed_by uuid not null references public.profiles (id),
  changed_at timestamptz not null default now(),
  reason text check (char_length(reason) <= 500)
);

alter table public.leave_requests enable row level security;
alter table public.allowance_overrides enable row level security;
alter table public.allowance_changes enable row level security;

-- No client write access to the append-only log or the override table.
revoke insert, update, delete on public.allowance_changes from anon, authenticated;
revoke insert, update, delete on public.allowance_overrides from anon, authenticated;
