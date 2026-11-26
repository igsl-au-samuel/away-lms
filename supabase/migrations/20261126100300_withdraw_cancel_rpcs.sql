-- #175 step 4 of 4: the three RPCs, and the one Google Calendar consequence.
--
-- Every write in this feature goes through these, as it has for requests since T104: the
-- client holds select on `leave_requests` and nothing else, so no page can invent a status.
-- The shape is `decide_leave_request`'s (20261017002200) -- caller resolved from the JWT,
-- role read from the profile rather than the claim (ADR 0007), the state test folded into the
-- UPDATE's WHERE so a race waits for the row lock and then matches nothing, P0001 with a
-- machine-readable message and a human detail.

-- ----------------------------------------------------------------------- 1. withdraw
--
-- The requester closes their own pending request. Nobody approves it, which is the whole
-- difference between this and a decline: the approver's queue loses the row and their
-- decision is never invented for them.
create function public.withdraw_leave_request(p_request_id uuid)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.app_role := private.current_role();
  requester uuid;
  result public.leave_requests;
begin
  -- Covers anon, a profile that has gone and a deactivated account, all of which read as
  -- `null` above. The function is granted to `authenticated`, so this is not a privilege
  -- check -- it is the check that there is a person behind the JWT.
  if caller_role is null then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only a signed-in user can withdraw a request.';
  end if;

  select user_id into requester from public.leave_requests where id = p_request_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found',
      detail = 'That request does not exist.';
  end if;

  -- Another person's request is not a different outcome, it is the same refusal: naming it
  -- would confirm the request exists to somebody who has no business knowing.
  if requester <> caller then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'You can only withdraw your own request.';
  end if;

  -- `decided_by` stays null -- see `leave_requests_decision_shape_check`. `decided_at` is the
  -- moment the row stopped being actionable, and it is what stamps the audit entry.
  update public.leave_requests
  set status = 'withdrawn',
      decided_at = now()
  where id = p_request_id and status = 'pending'
  returning * into result;

  if not found then
    raise exception using errcode = 'P0001', message = 'already_decided',
      detail = 'Only a pending request can be withdrawn. An approver has already answered this one.';
  end if;

  return result;
end;
$$;

revoke all on function public.withdraw_leave_request(uuid) from public, anon;
grant execute on function public.withdraw_leave_request(uuid) to authenticated;

-- ------------------------------------------------------------------- 2. ask to cancel
--
-- Approved leave only, and only by the requester. The leave does not move: it stays approved,
-- reserved and on the team calendar until an approver answers. `request_cancellation` opens a
-- question; nothing here closes one.
create function public.request_cancellation(p_request_id uuid, p_reason text default null)
returns public.cancellation_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.app_role := private.current_role();
  requester uuid;
  status_now public.request_status;
  result public.cancellation_requests;
begin
  if caller_role is null then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only a signed-in user can ask to cancel leave.';
  end if;

  select user_id, status into requester, status_now
  from public.leave_requests
  where id = p_request_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found',
      detail = 'That request does not exist.';
  end if;

  if requester <> caller then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'You can only ask to cancel your own leave.';
  end if;

  if status_now <> 'approved' then
    raise exception using errcode = 'P0001', message = 'not_cancellable',
      detail = 'Only approved leave can be cancelled. A pending request can be withdrawn instead.';
  end if;

  begin
    insert into public.cancellation_requests (request_id, requested_by, reason)
    values (p_request_id, caller, nullif(btrim(p_reason), ''))
    returning * into result;
  exception when unique_violation then
    -- `cancellation_requests_one_open`, the partial unique index on request_id where the ask
    -- is still pending. Two tabs open the same ask: the second waits on the index and then
    -- breaks it, so the race is answered with the same message as the deliberate second click.
    raise exception using errcode = 'P0001', message = 'already_requested',
      detail = 'You have already asked to cancel this leave.';
  end;

  return result;
end;
$$;

revoke all on function public.request_cancellation(uuid, text) from public, anon;
grant execute on function public.request_cancellation(uuid, text) to authenticated;

-- ------------------------------------------------------------------- 3. answer it
--
-- The same who-may-decide rule as `decide_leave_request`, read against the requester of the
-- leave rather than the decider recorded on it. Duplicated rather than extracted because that
-- is how the rule already exists in this database -- twice, in `decide_leave_request` and
-- `approval_queue` -- and a third copy in a migration is easier to review than moving the
-- other two. Extracting it into `private.can_decide(uuid)` is the right follow-up and does not
-- belong in the middle of an access change.
create function public.decide_cancellation(
  p_cancellation_id uuid,
  p_outcome public.request_status,
  p_comment text default null
)
returns public.cancellation_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.app_role := private.current_role();
  requester uuid;
  requester_role public.app_role;
  leave_id uuid;
  result public.cancellation_requests;
begin
  if caller_role is null or caller_role = 'employee' then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'Only managers and admins can answer a cancellation request.';
  end if;

  if p_outcome is null or p_outcome not in ('approved', 'declined') then
    raise exception using errcode = 'P0001', message = 'invalid_outcome',
      detail = 'A cancellation request can only be approved or declined.';
  end if;

  select c.requested_by, c.request_id, p.role into requester, leave_id, requester_role
  from public.cancellation_requests c
  join public.leave_requests r on r.id = c.request_id
  join public.profiles p on p.id = c.requested_by
  where c.id = p_cancellation_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found',
      detail = 'That cancellation request does not exist.';
  end if;

  if requester = caller then
    raise exception using errcode = 'P0001', message = 'own_request',
      detail = 'You cannot answer your own cancellation request.';
  end if;

  if not (
    (caller_role = 'manager' and requester_role in ('employee', 'admin'))
    or (caller_role = 'admin' and requester_role in ('employee', 'manager'))
  ) then
    raise exception using errcode = 'P0001', message = 'not_allowed',
      detail = 'You cannot decide this person''s requests.';
  end if;

  -- The leave first, and only for a yes: `private.audit_cancellation_decided` reads this row
  -- to describe what the answer did, and it has to read the answer rather than the question.
  if p_outcome = 'approved' then
    update public.leave_requests
    set status = 'cancelled'
    where id = leave_id and status = 'approved';

    if not found then
      raise exception using errcode = 'P0001', message = 'already_decided',
        detail = 'That leave is no longer approved.';
    end if;
  end if;

  -- Then the ask. Guarded the same way, so a second approver who was waiting on the row lock
  -- gets already_decided -- and the whole transaction, including the update above, is rolled
  -- back with it.
  update public.cancellation_requests
  set status = p_outcome,
      decided_by = caller,
      decided_at = now(),
      decision_comment = nullif(btrim(p_comment), '')
  where id = p_cancellation_id and status = 'pending'
  returning * into result;

  if not found then
    raise exception using errcode = 'P0001', message = 'already_decided',
      detail = 'That cancellation request has already been answered.';
  end if;

  return result;
end;
$$;

revoke all on function public.decide_cancellation(uuid, public.request_status, text)
  from public, anon;
grant execute on function public.decide_cancellation(uuid, public.request_status, text)
  to authenticated;

-- ------------------------------------------------------------------------ 4. calendar
--
-- An approved request that stops being approved has to come out of the real team calendar,
-- and `leave_requests_calendar_deleted` only fires on a row being deleted (20261017070000:73).
-- Without this trigger the Google event survives its own cancellation: the leave is gone from
-- Away, the outbox never hears about it, and the event is cleared only by the next delete.
--
-- `private.calendar_enqueue_deleted` already skips a demo person and reads everything it needs
-- from `old`, so it serves an UPDATE as it serves a DELETE.
create trigger leave_requests_calendar_cancelled
after update of status on public.leave_requests
for each row
when (old.status = 'approved' and new.status is distinct from old.status)
execute function private.calendar_enqueue_deleted();
