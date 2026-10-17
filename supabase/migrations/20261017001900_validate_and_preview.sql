-- T102: request validation shared by preview and submit (FR-012, FR-013, FR-014).
-- Returns every problem found, in a fixed order; an empty array means valid.
create function private.validate_request(
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
  errs text[] := '{}';
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
    if private.count_working_days(user_region, p_start, p_end) = 0 then
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

revoke all on function private.validate_request(uuid, uuid, date, date, text) from public, anon;
grant execute on function private.validate_request(uuid, uuid, date, date, text) to authenticated;

-- What submitting would do, without doing it. One row.
create function public.preview_leave_request(p_leave_type_id uuid, p_start date, p_end date)
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

  if p_start is not null and p_end is not null and p_end >= p_start then
    days := private.count_working_days(
      (select region_code from public.profiles where id = caller), p_start, p_end);
    available := private.available_balance(
      caller, p_leave_type_id, extract(year from p_start)::smallint);
  end if;

  return query select
    days::numeric(5,1),
    available::numeric(5,1),
    nullif(greatest(days - available, 0), 0)::numeric(5,1),
    private.validate_request(caller, p_leave_type_id, p_start, p_end, null);
end;
$$;

revoke all on function public.preview_leave_request(uuid, date, date) from public, anon;
grant execute on function public.preview_leave_request(uuid, date, date) to authenticated;
