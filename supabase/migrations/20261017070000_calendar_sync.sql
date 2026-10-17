-- #225, ADR 0013: Google Calendar sync on approval (access matrix rows 26-27).
-- An approval only inserts an outbox row. pg_cron pokes the calendar-sync Edge
-- Function, which claims due rows, calls the Calendar API and reports back.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table private.calendar_outbox (
  id bigint generated always as identity primary key,
  -- No FK: the row must outlive a deleted request so its event can be deleted.
  request_id uuid not null,
  action text not null check (action in ('create', 'delete')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  done_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now()
);

create index calendar_outbox_due_idx on private.calendar_outbox (next_attempt_at)
  where done_at is null and failed_at is null;

revoke all on private.calendar_outbox from public, anon, authenticated;

-- Triggers --------------------------------------------------------------------

create function private.calendar_enqueue_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Demo people are fiction: they never reach the real team calendar.
  if exists (select 1 from public.profiles where id = new.user_id and is_demo) then
    return new;
  end if;
  insert into private.calendar_outbox (request_id, action) values (new.id, 'create');
  return new;
end;
$$;

create trigger leave_requests_calendar_approved
after update of status on public.leave_requests
for each row
when (old.status = 'pending' and new.status = 'approved')
execute function private.calendar_enqueue_approved();

-- A request inserted already approved (a privileged path) needs its event too.
create trigger leave_requests_calendar_inserted
after insert on public.leave_requests
for each row
when (new.status = 'approved')
execute function private.calendar_enqueue_approved();

create function private.calendar_enqueue_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Same rule as the approval trigger: a demo person's event never existed.
  if exists (select 1 from public.profiles where id = old.user_id and is_demo) then
    return old;
  end if;
  insert into private.calendar_outbox (request_id, action) values (old.id, 'delete');
  return old;
end;
$$;

create trigger leave_requests_calendar_deleted
after delete on public.leave_requests
for each row
when (old.status = 'approved')
execute function private.calendar_enqueue_deleted();

-- RPCs (service_role only) ----------------------------------------------------

create function public.calendar_sync_claim(p_limit int default 20)
returns table (
  id bigint,
  request_id uuid,
  action text,
  attempts int,
  full_name text,
  start_date date,
  end_date date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select o.id
    from private.calendar_outbox o
    where o.done_at is null
      and o.failed_at is null
      and o.next_attempt_at <= now()
      and (o.locked_until is null or o.locked_until <= now())
      -- A request's rows run in order: a delete must not overtake a create still in flight,
      -- or the create would land after the delete and leave an orphan event.
      and not exists (
        select 1 from private.calendar_outbox earlier
        where earlier.request_id = o.request_id
          and earlier.id < o.id
          and earlier.done_at is null
          and earlier.failed_at is null
      )
    order by o.id
    limit greatest(p_limit, 0)
    for update skip locked
  ),
  claimed as (
    update private.calendar_outbox o
    set locked_until = now() + interval '3 minutes',
        attempts = o.attempts + 1
    from due
    where o.id = due.id
    returning o.id, o.request_id, o.action, o.attempts
  )
  select c.id, c.request_id, c.action, c.attempts, p.full_name, r.start_date, r.end_date
  from claimed c
  -- Only an approved request keeps its dates; otherwise the row comes back with nulls
  -- and a create counts as done.
  left join public.leave_requests r on r.id = c.request_id and r.status = 'approved'
  left join public.profiles p on p.id = r.user_id
  order by c.id;
end;
$$;

-- p_attempts is the claim's attempts value: a late report from a worker whose lock
-- expired (the row was re-claimed, or already finished) is ignored.
create function public.calendar_sync_finish(
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
  if p_outcome not in ('done', 'retry', 'fail', 'defer') then
    raise exception using errcode = 'P0001', message = 'invalid_outcome';
  end if;

  select attempts into tries
  from private.calendar_outbox
  where id = p_id and done_at is null and failed_at is null
  for update;
  if not found then
    if exists (select 1 from private.calendar_outbox where id = p_id) then
      return; -- already finished
    end if;
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if p_attempts is not null and p_attempts <> tries then
    return; -- stale: the row has been claimed again since
  end if;

  if p_outcome = 'done' then
    update private.calendar_outbox
    set done_at = now(), locked_until = null, last_error = null
    where id = p_id;
  elsif p_outcome = 'defer' then
    -- A systemic fault (for example no access token): wait, and do not spend an attempt.
    update private.calendar_outbox
    set attempts = greatest(tries - 1, 0),
        next_attempt_at = now() + interval '10 minutes',
        locked_until = null,
        last_error = left(p_error, 500)
    where id = p_id;
  elsif p_outcome = 'fail' or tries >= 6 then
    update private.calendar_outbox
    set failed_at = now(), locked_until = null, last_error = left(p_error, 500)
    where id = p_id;
  else
    update private.calendar_outbox
    set next_attempt_at = now() + (array['1 minute', '5 minutes', '30 minutes', '2 hours', '12 hours'])[greatest(tries, 1)]::interval,
        locked_until = null,
        last_error = left(p_error, 500)
    where id = p_id;
  end if;
end;
$$;

revoke all on function public.calendar_sync_claim(int) from public, anon, authenticated;
revoke all on function public.calendar_sync_finish(bigint, text, text, int) from public, anon, authenticated;
grant execute on function public.calendar_sync_claim(int) to service_role;
grant execute on function public.calendar_sync_finish(bigint, text, text, int) to service_role;

-- Kick ------------------------------------------------------------------------
-- Inert until both Vault secrets exist, so CI, fresh and hosted databases do nothing.

create function private.calendar_sync_kick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'calendar_sync_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'calendar_sync_secret';
  if fn_url is null or fn_secret is null then
    return;
  end if;

  if exists (
    select 1 from private.calendar_outbox
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

revoke all on function private.calendar_sync_kick() from public, anon, authenticated;

select cron.schedule('calendar-sync-kick', '* * * * *', 'select private.calendar_sync_kick()');
