-- #461 defect 1: the cutover written in 20261127100000 could never let the first batch through.
--
-- It stamps `email_cutover.deployed_at` on the first claim to execute and closes every older row as
-- `queued before the sender was configured` — but `private.email_notify_kick()` only reaches
-- `net.http_post` when a due row already exists (20261127100000:417), so an empty queue wakes
-- nothing. The first claim in a database's life therefore always happens *after* the rows that
-- caused it, which makes those rows older than its own stamp by construction: the guard retired
-- exactly the batch that woke the sender, in every environment, forever.
--
-- Measured in production on `c670c60`, against the first request anyone ever submitted:
--   queued 02:15:06.608996  ->  stamped 02:16:04.138311  =  57.5 seconds old, four approvers,
--   attempts 0, done_at set, and never mailed. The Vault rows landed 01:44:23, the migration applied
--   02:10:17 and the function deployed 02:10:34, so nothing was unconfigured at either end. The
--   premise the old comment stated — "an environment configured later" — was simply false here.
--
-- The fix is a window rather than a boundary. A row is retired only if it queued more than an hour
-- before the sender first ran, so the batch that woke it is minutes old and gets sent, while a queue
-- that filled over a fortnight of nobody reading it is still retired instead of arriving as news
-- weeks late — which was the whole point of the table. Seeding `deployed_at` in the migration itself
-- would fix this case and lose that one, so the window is the only shape holding both promises.
--
-- What this migration deliberately does not do: re-open the four closed production rows. That is a
-- data decision, not a schema one, and re-queuing them would mail "has submitted a request for you
-- to decide" about a request that may have been decided an hour ago. The SQL is in the issue.

create or replace function public.email_notify_claim(p_limit int default 20)
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
declare
  opened_at timestamptz;
begin
  -- The first claim writes down the hour the sender started running, and retires only what queued
  -- an hour or more before that. `<` rather than `<=` still matters inside one transaction, where
  -- now() does not move, and the window is what stops it from also swallowing the rows that caused
  -- this very call — #461 is what that looked like when it did.
  select deployed_at into opened_at from private.email_cutover;
  if opened_at is null then
    insert into private.email_cutover (deployed_at) values (now())
      returning deployed_at into opened_at;
    update private.email_outbox
      set done_at = now(), last_error = 'queued before the sender was configured'
      where done_at is null and failed_at is null
        and created_at < opened_at - interval '1 hour';
  end if;

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

-- `create or replace` carries the old privileges over, so these two lines change nothing today. They
-- are here because row 47's sweep asserts the grant state of every `email%` function, and a later
-- edit that recreates this one should not have to remember them.
revoke all on function public.email_notify_claim(int) from public, anon, authenticated;
grant execute on function public.email_notify_claim(int) to service_role;
