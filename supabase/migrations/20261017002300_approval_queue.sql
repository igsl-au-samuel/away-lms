-- T120: the pending requests the caller may decide, oldest first (access matrix
-- row 17, FR-021). Same who-may-decide rule as decide_leave_request.
-- available_now is the requester's balance now, which already counts the pending
-- request itself. over_balance_days is the shortfall recorded at submission.
create function public.approval_queue()
returns table (
  id uuid,
  user_id uuid,
  requester_name text,
  requester_is_demo boolean,
  leave_type_id uuid,
  leave_type_name text,
  is_capped boolean,
  start_date date,
  end_date date,
  working_days numeric,
  note text,
  over_balance_days numeric,
  available_now numeric,
  created_at timestamptz
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
  if caller_role is null or caller_role = 'employee' then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only managers and admins can see the approval queue.';
  end if;

  return query
  select
    r.id,
    r.user_id,
    p.full_name,
    p.is_demo,
    r.leave_type_id,
    lt.name,
    lt.is_capped,
    r.start_date,
    r.end_date,
    r.working_days,
    r.note,
    r.over_balance_days,
    private.available_balance(r.user_id, r.leave_type_id, extract(year from r.start_date)::smallint),
    r.created_at
  from public.leave_requests r
  join public.profiles p on p.id = r.user_id
  join public.leave_types lt on lt.id = r.leave_type_id
  where r.status = 'pending'
    and r.user_id <> caller
    and (
      (caller_role = 'manager' and p.role in ('employee', 'admin'))
      or (caller_role = 'admin' and p.role in ('employee', 'manager'))
    )
  order by r.created_at, r.id;
end;
$$;

revoke all on function public.approval_queue() from public, anon;
grant execute on function public.approval_queue() to authenticated;
