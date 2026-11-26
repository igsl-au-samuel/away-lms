-- #175 step 3 of 4: what the audit log says about the new events.
--
-- Four new actions, and one existing arm that would have started lying. `audit_log_action_known`
-- is a check constraint, so the whitelist has to grow before an entry can carry these names;
-- and `private.audit_requests` ended its decision arm with
--
--   case new.status when 'approved' then 'request_approved' else 'request_declined' end
--
-- on the strength of a comment that said `request_status` has exactly three values. With a
-- fourth, a withdrawal would have been filed as a decline -- the actor recorded as the person
-- who withdrew, the verb recorded as somebody else saying no. That is the whole reason this
-- step exists beside the RPCs rather than after them: the moment the RPCs are executable, the
-- mislabelling is, too.

-- ------------------------------------------------------------------- 1. the whitelist
--
-- Named in 20261116062027, so no lookup is needed. The dropped and re-added constraint are the
-- same statement, and a check constraint on an existing table validates the rows it re-scans --
-- here there are none, because none of these four actions existed before this file ran.
alter table public.audit_log drop constraint audit_log_action_known;

alter table public.audit_log add constraint audit_log_action_known check (action in (
  'request_submitted', 'request_approved', 'request_declined', 'request_withdrawn',
  'cancellation_requested', 'cancellation_approved', 'cancellation_declined',
  'allowance_set', 'allowance_removed',
  'user_created', 'user_role_changed', 'user_region_changed', 'user_active_changed',
  'leave_type_default_changed', 'leave_type_changed'
));

-- ------------------------------------------------------------------ 2. request statuses
--
-- The full body, unchanged except for the decision arm and the comment under it. The
-- `audit_decision` trigger's own clause (`old.status = 'pending' and new.status is distinct
-- from old.status`, 20261116062030_audit_triggers.sql:174) already fires for
-- pending -> withdrawn, so no trigger needs re-creating for this half.
create or replace function private.audit_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type_name text;
begin
  select name into v_type_name from public.leave_types where id = new.leave_type_id;

  if tg_op = 'INSERT' then
    perform private.audit_write(
      'request_submitted', 'leave_request', new.id, new.user_id,
      null,
      jsonb_build_object('status', new.status),
      jsonb_build_object(
        'leave_type_id', new.leave_type_id,
        'leave_type_name', v_type_name,
        'year', extract(year from new.start_date)::int,
        'start_date', new.start_date,
        'end_date', new.end_date,
        'working_days', new.working_days
      ),
      null,
      new.created_at
    );
    return null;
  end if;

  -- request_approved, request_declined or request_withdrawn. The WHEN clause has already
  -- excluded anything that was not pending, and of the five values `request_status` now holds
  -- only these three can be reached from pending: `approved` and `declined` are decided by an
  -- approver, `withdrawn` by the requester. There is no `else` arm, because the one transition
  -- that would land there -- pending -> cancelled -- has no meaning: you cancel leave that was
  -- approved, and withdraw leave that was not.
  perform private.audit_write(
    case new.status
      when 'approved'  then 'request_approved'
      when 'withdrawn' then 'request_withdrawn'
      else 'request_declined'
    end,
    'leave_request', new.id, new.user_id,
    jsonb_build_object('status', old.status),
    jsonb_build_object('status', new.status),
    jsonb_build_object(
      'leave_type_id', new.leave_type_id,
      'leave_type_name', v_type_name,
      'year', extract(year from new.start_date)::int,
      'start_date', new.start_date,
      'end_date', new.end_date,
      'working_days', new.working_days
    ),
    new.decision_comment,
    new.decided_at
  );
  return null;
end;
$$;

-- ------------------------------------------------------------- 3. the cancellation leg
--
-- An ask and its answer are about the leave, not about the row that carries the ask, so every
-- entry names the parent request: `entity_id` is `leave_requests.id` and the subject is its
-- requester. That is what makes the entry findable from `/history` and from the request, which
-- is where a reader is standing when they ask "what happened to this". The cancellation's own
-- id goes in `context`, the way `leave_type_id` does.
--
-- Two functions rather than one with a `tg_op` branch, because `old` does not exist in an INSERT
-- trigger and a CASE around it would only look lazy. The pair also reads as the two events: an
-- ask arrives, and later somebody answers it.
create function private.audit_cancellation_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_leave_type_id uuid;
  v_type_name text;
  v_start_date date;
  v_end_date date;
  v_working_days numeric;
begin
  select r.user_id, r.leave_type_id, lt.name, r.start_date, r.end_date, r.working_days
    into v_user_id, v_leave_type_id, v_type_name, v_start_date, v_end_date, v_working_days
    from public.leave_requests r
    join public.leave_types lt on lt.id = r.leave_type_id
   where r.id = new.request_id;

  if not found then
    -- request_id is not null and the parent cascades, so this cannot be reached through the
    -- RPC. Guarded anyway: an entry that invented a person's dates is worse than no entry.
    return null;
  end if;

  perform private.audit_write(
    'cancellation_requested', 'leave_request', new.request_id, v_user_id,
    jsonb_build_object('status', 'approved'),
    jsonb_build_object('status', 'approved', 'cancellation', 'requested'),
    jsonb_build_object(
      'cancellation_id', new.id,
      'leave_type_id', v_leave_type_id,
      'leave_type_name', v_type_name,
      'year', extract(year from v_start_date)::int,
      'start_date', v_start_date,
      'end_date', v_end_date,
      'working_days', v_working_days
    ),
    nullif(btrim(new.reason), ''),
    new.requested_at
  );
  return null;
end;
$$;

create trigger audit_cancellation_requested
  after insert on public.cancellation_requests
  for each row execute function private.audit_cancellation_requested();

create function private.audit_cancellation_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_leave_type_id uuid;
  v_type_name text;
  v_start_date date;
  v_end_date date;
  v_working_days numeric;
begin
  -- The leave's own status, read live: `decide_cancellation` settles the parent before the
  -- child, so by the time this runs an approved cancellation has already moved the leave to
  -- `cancelled`. The `before` pair is the one value this function may name outright -- an ask
  -- is only ever raised against approved leave, which is what `request_cancellation` enforces.
  select r.status::text, r.leave_type_id, lt.name, r.start_date, r.end_date, r.working_days
    into v_status, v_leave_type_id, v_type_name, v_start_date, v_end_date, v_working_days
    from public.leave_requests r
    join public.leave_types lt on lt.id = r.leave_type_id
   where r.id = old.request_id;

  if not found then
    return null;
  end if;

  perform private.audit_write(
    case new.status when 'approved' then 'cancellation_approved' else 'cancellation_declined' end,
    'leave_request', old.request_id, old.requested_by,
    jsonb_build_object('status', 'approved', 'cancellation', 'requested'),
    jsonb_build_object('status', v_status, 'cancellation', new.status),
    jsonb_build_object(
      'cancellation_id', new.id,
      'leave_type_id', v_leave_type_id,
      'leave_type_name', v_type_name,
      'year', extract(year from v_start_date)::int,
      'start_date', v_start_date,
      'end_date', v_end_date,
      'working_days', v_working_days
    ),
    nullif(btrim(new.decision_comment), ''),
    new.decided_at
  );
  return null;
end;
$$;

-- `of status`, plus a WHEN clause on the pending pair, so an edit that changes nothing writes
-- nothing -- the same shape as `audit_decision` on leave_requests.
create trigger audit_cancellation_decided
  after update of status on public.cancellation_requests
  for each row
  when (old.status = 'pending' and new.status is distinct from old.status)
  execute function private.audit_cancellation_decided();

-- Nothing outside a trigger may write an entry (R5 step 3), so both of these are pulled back
-- to the owner. The grant sweep at the end of `row40_audit_private_functions.sql` matches on
-- the `audit` prefix rather than a list of names, so it is what catches a new writer that
-- forgets this line -- these two are covered by it the day they exist.
revoke all on function private.audit_cancellation_requested()
  from public, anon, authenticated, service_role;
revoke all on function private.audit_cancellation_decided()
  from public, anon, authenticated, service_role;
