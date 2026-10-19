-- T103: submit a leave request for yourself (access matrix row 12, FR-011–FR-014).
-- working_days, region_code and over_balance_days are fixed at submission.
create function public.submit_leave_request(
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
       nullif(greatest(days - available, 0), 0), p_note)
    returning * into result;
  exception when exclusion_violation then
    raise exception using errcode = 'P0001', message = 'overlap',
      detail = 'Those dates overlap one of your pending or approved requests.';
  end;

  return result;
end;
$$;

revoke all on function public.submit_leave_request(uuid, date, date, text) from public, anon;
grant execute on function public.submit_leave_request(uuid, date, date, text) to authenticated;
