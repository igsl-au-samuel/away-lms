-- T119: decide a pending request (access matrix rows 13-16, FR-017-FR-020).
-- A manager decides employee and admin requests; an admin decides employee and
-- manager requests; nobody decides their own. A decision is final.
create function public.decide_leave_request(
  p_request_id uuid,
  p_outcome public.request_status,
  p_comment text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.app_role := private.current_role();
  requester uuid;
  requester_role public.app_role;
  result public.leave_requests;
begin
  if caller_role is null or caller_role = 'employee' then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only managers and admins can decide leave requests.';
  end if;

  if p_outcome is null or p_outcome not in ('approved', 'declined') then
    raise exception using errcode = 'P0001', message = 'invalid_outcome',
      detail = 'A request can only be approved or declined.';
  end if;

  select r.user_id, p.role into requester, requester_role
  from public.leave_requests r
  join public.profiles p on p.id = r.user_id
  where r.id = p_request_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found',
      detail = 'That request does not exist.';
  end if;

  if requester = caller then
    raise exception using errcode = 'P0001', message = 'own_request',
      detail = 'You cannot decide your own request.';
  end if;

  if not (
    (caller_role = 'manager' and requester_role in ('employee', 'admin'))
    or (caller_role = 'admin' and requester_role in ('employee', 'manager'))
  ) then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'You cannot decide this person''s requests.';
  end if;

  -- The status guard makes a race safe: the second decision waits for the first
  -- one's row lock, sees the request is no longer pending, and updates nothing.
  update public.leave_requests
  set status = p_outcome,
      decided_by = caller,
      decided_at = now(),
      decision_comment = nullif(btrim(p_comment), '')
  where id = p_request_id and status = 'pending'
  returning * into result;

  if not found then
    raise exception using errcode = 'P0001', message = 'already_decided',
      detail = 'That request has already been decided.';
  end if;

  return result;
end;
$$;

revoke all on function public.decide_leave_request(uuid, public.request_status, text) from public, anon;
grant execute on function public.decide_leave_request(uuid, public.request_status, text) to authenticated;
