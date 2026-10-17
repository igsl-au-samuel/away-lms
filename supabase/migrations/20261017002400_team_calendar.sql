-- T130: who is away between two dates (access matrix rows 18-19, FR-024, FR-024a).
-- Any active user gets every pending and approved request that overlaps the range,
-- including deactivated people's leave (US6-2). The leave type is shown only to the
-- requester, a manager or an admin. Notes and decision comments are never returned.
-- region_code is the person's current region, which is how the calendar groups people.
create function public.team_calendar(p_from date, p_to date)
returns table (
  request_id uuid,
  user_id uuid,
  full_name text,
  region_code text,
  is_demo boolean,
  is_active boolean,
  start_date date,
  end_date date,
  status public.request_status,
  leave_type_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := (select auth.uid());
  caller_role public.app_role := private.current_role();
begin
  if caller_role is null then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only active users can see the team calendar.';
  end if;

  if p_from is null or p_to is null or p_to < p_from or p_to - p_from + 1 > 62 then
    raise exception using errcode = 'P0001', message = 'invalid_range',
      detail = 'The calendar range must be between 1 and 62 days.';
  end if;

  return query
  select
    r.id,
    r.user_id,
    p.full_name,
    p.region_code,
    p.is_demo,
    p.is_active,
    r.start_date,
    r.end_date,
    r.status,
    case when r.user_id = caller or caller_role in ('manager', 'admin') then lt.name end
  from public.leave_requests r
  join public.profiles p on p.id = r.user_id
  join public.leave_types lt on lt.id = r.leave_type_id
  where r.status in ('pending', 'approved')
    and r.start_date <= p_to
    and r.end_date >= p_from
  order by p.full_name, r.start_date, r.id;
end;
$$;

revoke all on function public.team_calendar(date, date) from public, anon;
grant execute on function public.team_calendar(date, date) to authenticated;
