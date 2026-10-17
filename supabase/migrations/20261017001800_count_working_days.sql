-- T101: working days in a range for a holiday region (FR-012). Skips Saturdays,
-- Sundays and that region's public holidays. Counts 0 when the end is before the start.
create function private.count_working_days(p_region text, p_start date, p_end date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::numeric
  from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') as d
  where extract(isodow from d) < 6
    and not exists (
      select 1 from public.public_holidays h
      where h.region_code = p_region and h.holiday_date = d::date
    );
$$;

revoke all on function private.count_working_days(text, date, date) from public, anon;
grant execute on function private.count_working_days(text, date, date) to authenticated;
