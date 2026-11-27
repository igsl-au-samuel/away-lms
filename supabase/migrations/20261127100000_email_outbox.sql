-- #174, ADR 0019: the email notifications ride the same outbox shape ADR 0013 shipped for the
-- calendar. A submit or a decision only inserts rows here; pg_cron pokes the email-notify Edge
-- Function through pg_net, and that function claims due rows, calls the provider's HTTP API and
-- reports back.
--
-- Why a row per recipient instead of one row per event: the retry unit has to be a send, not a
-- message. A batch of approvers where one address is dead must not fail the other four, and
-- "one email per submitted request" is a promise about a person, so it belongs in the key.
--
-- Why the enqueue is a trigger and not application code: a decision reaches `leave_requests`
-- from the app's Server Action, from `public.decide_leave_request` through the LMS MCP server,
-- from `public.decide_cancellation` and from the demo loader. A send written in the action would
-- cover one of those four, which is the same mistake ADR 0013 names as its first reason.
--
-- Inert until Sam configures it: no Vault rows means `private.email_notify_kick()` returns
-- before it reaches `net.http_post`, so a fresh database, CI and this stack send nothing.

-- --------------------------------------------------------------------------- the outbox

create table private.email_outbox (
  id bigint generated always as identity primary key,
  -- No FK on either id, the same choice as private.calendar_outbox: the row is the record that
  -- the app decided to say something. Dropping it because the request or the person underneath
  -- went away destroys the evidence, so a vanished subject is claimed with nulls and skipped.
  request_id uuid not null,
  cancellation_id uuid,
  -- The same six verbs the audit log uses for these events (20261126100200:23), so one vocabulary
  -- describes what happened in both places. `request_withdrawn` is deliberately absent: the
  -- person who withdrew is the one person who already knows.
  event text not null check (event in (
    'request_submitted', 'request_approved', 'request_declined',
    'cancellation_requested', 'cancellation_approved', 'cancellation_declined'
  )),
  recipient uuid not null,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  done_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now()
);

-- One send per (event, person, subject). For a request-level event the subject is the request;
-- for the cancellation leg it is the ask, because a declined ask followed by a second ask is two
-- questions and deserves two emails. `coalesce` rather than a nulls-not-distinct key so the
-- index means the same thing on every Postgres this project runs on.
create unique index email_outbox_one_send_per_person
  on private.email_outbox (event, recipient, coalesce(cancellation_id, request_id));

create index email_outbox_due_idx on private.email_outbox (next_attempt_at)
  where done_at is null and failed_at is null;

revoke all on private.email_outbox from public, anon, authenticated;

-- Triggers --------------------------------------------------------------------
-- Four functions, one per event pair, because `old` does not exist in an INSERT trigger and a
-- CASE around it would only look lazy (the reasoning is copied from #175's audit step).

-- Who has to know that something new landed: every active manager and admin except the person who
-- raised it. No region filter, because the app does not have one to honour --
-- profiles_select is `(select private.current_role()) is not null`
-- (20261017001100_policies_profiles.sql:4) and the leave_requests policies carry no region
-- predicate, so a regional cut here would invent a visibility rule the screens do not have.
-- Demo people need no filter of their own: `check (not is_demo or role = 'employee')`
-- (20261017000200_profiles.sql:12) makes a demo approver impossible, so the role test already
-- excludes them. The requester-side demo test below is the live one.

-- A new pending request tells the approvers.
create function private.email_enqueue_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Demo people are fiction, and a fiction cannot be approved by email (ADR 0013's rule).
  if exists (select 1 from public.profiles where id = new.user_id and is_demo) then
    return null;
  end if;

  insert into private.email_outbox (request_id, event, recipient)
  select new.id, 'request_submitted', p.id
  from public.profiles p
  where p.role in ('manager', 'admin')
    and p.is_active
    and p.id <> new.user_id;

  return null;
end;
$$;

-- Only the requester hears the answer, and only from `pending`, so the same WHEN clause the
-- audit trigger uses (20261116062030_audit_triggers.sql:174) covers approve, decline and nothing
-- else. A withdrawal is not a decision and gets no email; the withdrawer is the recipient they
-- would have gone to.
create function private.email_enqueue_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('approved', 'declined') then
    return null;
  end if;
  if exists (select 1 from public.profiles where id = new.user_id and is_demo) then
    return null;
  end if;

  insert into private.email_outbox (request_id, event, recipient)
  values (new.id, case new.status when 'approved' then 'request_approved' else 'request_declined' end, new.user_id);

  return null;
end;
$$;

-- An ask to cancel goes to the same audience, minus the person asking.
create function private.email_enqueue_cancellation_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.leave_requests r
    join public.profiles p on p.id = r.user_id
    where r.id = new.request_id and p.is_demo
  ) then
    return null;
  end if;

  insert into private.email_outbox (request_id, cancellation_id, event, recipient)
  select new.request_id, new.id, 'cancellation_requested', p.id
  from public.profiles p
  where p.role in ('manager', 'admin')
    and p.is_active
    and p.id <> new.requested_by;

  return null;
end;
$$;

-- The answer to an ask goes back to the person who asked, with the outcome and the comment.
-- The leave row is already cancelled by the time this fires for a yes (20261126100300:193), which
-- is why the event names the ask rather than the request's status.
create function private.email_enqueue_cancellation_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.leave_requests r
    join public.profiles p on p.id = r.user_id
    where r.id = new.request_id and p.is_demo
  ) then
    return null;
  end if;

  -- `decided_by <> requested_by` is a check on the table (20261126100100:104), so this recipient
  -- can never be the person who just answered their own ask.
  insert into private.email_outbox (request_id, cancellation_id, event, recipient)
  values (new.request_id, new.id,
          case new.status when 'approved' then 'cancellation_approved' else 'cancellation_declined' end,
          new.requested_by);

  return null;
end;
$$;

create trigger leave_requests_email_submitted
after insert on public.leave_requests
for each row
when (new.status = 'pending')
execute function private.email_enqueue_submitted();

create trigger leave_requests_email_decided
after update of status on public.leave_requests
for each row
when (old.status = 'pending' and new.status is distinct from old.status)
execute function private.email_enqueue_decided();

create trigger cancellation_requests_email_requested
after insert on public.cancellation_requests
for each row
execute function private.email_enqueue_cancellation_requested();

create trigger cancellation_requests_email_decided
after update of status on public.cancellation_requests
for each row
when (old.status = 'pending' and new.status is distinct from old.status)
execute function private.email_enqueue_cancellation_decided();

-- Nothing outside a trigger may run these, the same pull-back #175's audit step applies to its own
-- trigger functions (20261126100200:218). A trigger body needs no EXECUTE from the invoking role --
-- row40 proves it for the four audit writers -- so this costs nothing and closes the "NEW is not
-- defined" call a user could otherwise make.
revoke all on function private.email_enqueue_submitted() from public, anon, authenticated, service_role;
revoke all on function private.email_enqueue_decided() from public, anon, authenticated, service_role;
revoke all on function private.email_enqueue_cancellation_requested() from public, anon, authenticated, service_role;
revoke all on function private.email_enqueue_cancellation_decided() from public, anon, authenticated, service_role;

-- RPCs (service_role only) ----------------------------------------------------

-- Everything the message needs, read at send time rather than copied at enqueue: an email address
-- that changed since the request landed is honoured, and a person who was switched off in the
-- meantime comes back with a null address, which the function reports as `skipped` rather than
-- mailing. `is_active` is then the one switch that stops mail to a person, and it stops it for the
-- queue that is already waiting and not only for what comes after.
--
-- `detail` is the leak guard, and it is a SQL rule rather than a rule in the sender. The six
-- events each have exactly one free-text field they may carry, and the claim returns only that
-- one in that one column, so the text another person wrote that this recipient has no right to
-- never reaches the function's process at all.
create function public.email_notify_claim(p_limit int default 20)
returns table (
  id bigint,
  event text,
  attempts int,
  recipient_email text,
  recipient_name text,
  subject_name text,
  other_name text,
  leave_type text,
  start_date date,
  end_date date,
  working_days numeric,
  detail text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select o.id
    from private.email_outbox o
    where o.done_at is null
      and o.failed_at is null
      and o.next_attempt_at <= now()
      and (o.locked_until is null or o.locked_until <= now())
    order by o.id
    limit greatest(p_limit, 0)
    for update skip locked
  ),
  claimed as (
    update private.email_outbox o
    set locked_until = now() + interval '3 minutes',
        attempts = o.attempts + 1
    from due
    where o.id = due.id
    returning o.id, o.event, o.attempts, o.recipient, o.request_id, o.cancellation_id
  )
  select c.id,
         c.event,
         c.attempts,
         rp.email,
         rp.full_name,
         sp.full_name,
         op.full_name,
         lt.name,
         r.start_date,
         r.end_date,
         r.working_days,
         case c.event
           when 'request_submitted'      then r.note
           when 'request_approved'       then r.decision_comment
           when 'request_declined'       then r.decision_comment
           when 'cancellation_requested' then cr.reason
           else cr.decision_comment
         end
  from claimed c
  left join public.profiles rp on rp.id = c.recipient and rp.is_active
  left join public.leave_requests r on r.id = c.request_id
  left join public.profiles sp on sp.id = r.user_id
  left join public.leave_types lt on lt.id = r.leave_type_id
  left join public.cancellation_requests cr on cr.id = c.cancellation_id
  -- Who the message is also about: the asker, the decider, or the requester, depending on the
  -- event. Resolved here rather than in the sender so the sender never sees an id.
  left join public.profiles op on op.id = case c.event
    when 'request_submitted'      then r.user_id
    when 'request_approved'       then r.decided_by
    when 'request_declined'       then r.decided_by
    when 'cancellation_requested' then cr.requested_by
    else cr.decided_by
  end
  order by c.id;
end;
$$;

-- p_attempts is the claim's attempts value: a late report from a worker whose lock expired (the
-- row was re-claimed, or already finished) is ignored. `skipped` is calendar's `done` split in
-- two, because a row that was never sent needs to say why it was not.
create function public.email_notify_finish(
  p_id bigint,
  p_outcome text,
  p_error text default null,
  p_attempts int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tries int;
begin
  if p_outcome not in ('done', 'retry', 'fail', 'defer', 'skipped') then
    raise exception using errcode = 'P0001', message = 'invalid_outcome';
  end if;

  select attempts into tries
  from private.email_outbox
  where id = p_id and done_at is null and failed_at is null
  for update;
  if not found then
    if exists (select 1 from private.email_outbox where id = p_id) then
      return; -- already finished
    end if;
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if p_attempts is not null and p_attempts <> tries then
    return; -- stale: the row has been claimed again since
  end if;

  if p_outcome = 'done' then
    update private.email_outbox
    set done_at = now(), locked_until = null, last_error = null
    where id = p_id;
  elsif p_outcome = 'skipped' then
    -- Nothing to send: no address, no person, no request. Complete, with the reason kept.
    update private.email_outbox
    set done_at = now(), locked_until = null, last_error = left(p_error, 500)
    where id = p_id;
  elsif p_outcome = 'defer' then
    -- A systemic fault (no API key, a refused credential): wait, and do not spend an attempt.
    update private.email_outbox
    set attempts = greatest(tries - 1, 0),
        next_attempt_at = now() + interval '10 minutes',
        locked_until = null,
        last_error = left(p_error, 500)
    where id = p_id;
  elsif p_outcome = 'fail' or tries >= 6 then
    update private.email_outbox
    set failed_at = now(), locked_until = null, last_error = left(p_error, 500)
    where id = p_id;
  else
    update private.email_outbox
    set next_attempt_at = now() + (array['1 minute', '5 minutes', '30 minutes', '2 hours', '12 hours'])[greatest(tries, 1)]::interval,
        locked_until = null,
        last_error = left(p_error, 500)
    where id = p_id;
  end if;
end;
$$;

revoke all on function public.email_notify_claim(int) from public, anon, authenticated;
revoke all on function public.email_notify_finish(bigint, text, text, int) from public, anon, authenticated;
grant execute on function public.email_notify_claim(int) to service_role;
grant execute on function public.email_notify_finish(bigint, text, text, int) to service_role;

-- Kick ------------------------------------------------------------------------
-- Inert until both Vault secrets exist, so CI, fresh and hosted databases do nothing.

create function private.email_notify_kick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'email_notify_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'email_notify_secret';
  if fn_url is null or fn_secret is null then
    return;
  end if;

  if exists (
    select 1 from private.email_outbox
    where done_at is null and failed_at is null
      and next_attempt_at <= now()
      and (locked_until is null or locked_until <= now())
  ) then
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || fn_secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  end if;
end;
$$;

-- pg_cron is the only caller, and it runs as the role that applied the migration, so no API role
-- needs this one either. Keeping it inside the `email%` sweep in
-- `row47_48_email_notify_access.sql` is what stops a fifth writer appearing without a revoke.
revoke all on function private.email_notify_kick() from public, anon, authenticated, service_role;

select cron.schedule('email-notify-kick', '* * * * *', 'select private.email_notify_kick()');
