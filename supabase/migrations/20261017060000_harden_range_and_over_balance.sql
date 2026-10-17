-- Review fixes: a multi-year range is refused before any day-by-day count (it was
-- counted first, so one call could generate millions of rows), and over_balance_days
-- is capped at the request's own days when the balance is already negative.
-- Bodies replace the functions from 20261017001900 and 20261017002000; grants carry over.

create or replace function private.validate_request(
  p_user uuid,
  p_leave_type_id uuid,
  p_start date,
  p_end date,
  p_note text
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  errs text[] := '{}'::text[];
  valid_range boolean := p_start is not null and p_end is not null and p_end >= p_start;
  user_region text;
begin
  if not valid_range then
    errs := array_append(errs, 'invalid_range');
  elsif extract(year from p_start) <> extract(year from p_end) then
    errs := array_append(errs, 'spans_years');
  end if;

  if not exists (select 1 from public.leave_types where id = p_leave_type_id and is_active) then
    errs := array_append(errs, 'type_inactive');
  end if;

  if valid_range then
    select region_code into user_region from public.profiles where id = p_user;
    -- A range spanning years is already refused, so skip the day-by-day count for it.
    if not ('spans_years' = any(errs))
       and private.count_working_days(user_region, p_start, p_end) = 0 then
      errs := array_append(errs, 'no_working_days');
    end if;

    if exists (
      select 1 from public.leave_requests r
      where r.user_id = p_user
        and r.status in ('pending', 'approved')
        and daterange(r.start_date, r.end_date, '[]') && daterange(p_start, p_end, '[]')
    ) then
      errs := array_append(errs, 'overlap');
    end if;
  end if;

  if char_length(p_note) > 500 then
    errs := array_append(errs, 'note_too_long');
  end if;

  return errs;
end;
$$;

create or replace function public.preview_leave_request(p_leave_type_id uuid, p_start date, p_end date)
returns table (
  working_days numeric,
  available_before numeric,
  over_balance_days numeric,
  errors text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  days numeric;
  available numeric;
begin
  if private.current_role() is null then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only active users can request leave.';
  end if;

  if p_start is not null and p_end is not null and p_end >= p_start
     and extract(year from p_start) = extract(year from p_end) then
    days := private.count_working_days(
      (select region_code from public.profiles where id = caller), p_start, p_end);
    available := private.available_balance(
      caller, p_leave_type_id, extract(year from p_start)::smallint);
  end if;

  return query select
    days::numeric(5,1),
    available::numeric(5,1),
    nullif(least(days, greatest(days - available, 0)), 0)::numeric(5,1),
    private.validate_request(caller, p_leave_type_id, p_start, p_end, null);
end;
$$;

create or replace function public.submit_leave_request(
  p_leave_type_id uuid,
  p_start date,
  p_end date,
  p_note text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  user_region text;
  errs text[];
  days numeric;
  available numeric;
  result public.leave_requests;
begin
  if private.current_role() is null then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only active users can request leave.';
  end if;

  -- One submit at a time per user, so a second one sees the first's days.
  select region_code into user_region from public.profiles where id = caller for update;

  errs := private.validate_request(caller, p_leave_type_id, p_start, p_end, p_note);
  if cardinality(errs) > 0 then
    raise exception using errcode = 'P0001', message = errs[1],
      detail = case errs[1]
        when 'invalid_range' then 'The end date is before the start date.'
        when 'spans_years' then 'A request cannot span two leave years.'
        when 'type_inactive' then 'That leave type is not available.'
        when 'no_working_days' then 'Those dates have no working days.'
        when 'overlap' then 'Those dates overlap one of your pending or approved requests.'
        when 'note_too_long' then 'The note is longer than 500 characters.'
      end;
  end if;

  days := private.count_working_days(user_region, p_start, p_end);
  available := private.available_balance(caller, p_leave_type_id, extract(year from p_start)::smallint);

  begin
    insert into public.leave_requests
      (user_id, leave_type_id, start_date, end_date, region_code, working_days, over_balance_days, note)
    values
      (caller, p_leave_type_id, p_start, p_end, user_region, days,
       nullif(least(days, greatest(days - available, 0)), 0), p_note)
    returning * into result;
  exception when exclusion_violation then
    raise exception using errcode = 'P0001', message = 'overlap',
      detail = 'Those dates overlap one of your pending or approved requests.';
  end;

  return result;
end;
$$;
