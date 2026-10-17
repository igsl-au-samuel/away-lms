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
  insert into private.calendar_outbox (request_id, action) values (new.id, 'create');
  return new;
end;
$$;

create trigger leave_requests_calendar_approved
after update of status on public.leave_requests
for each row
when (old.status = 'pending' and new.status = 'approved')
execute function private.calendar_enqueue_approved();

create function private.calendar_enqueue_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
    order by o.id
    limit greatest(p_limit, 0)
    for update skip locked
  ),
  claimed as (
    update private.calendar_outbox o
    set locked_until = now() + interval '2 minutes',
        attempts = o.attempts + 1
    from due
    where o.id = due.id
    returning o.id, o.request_id, o.action, o.attempts
  )
  select c.id, c.request_id, c.action, c.attempts, p.full_name, r.start_date, r.end_date
  from claimed c
  left join public.leave_requests r on r.id = c.request_id
  left join public.profiles p on p.id = r.user_id
  order by c.id;
end;
$$;

create function public.calendar_sync_finish(
  p_id bigint,
  p_outcome text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tries int;
begin
  if p_outcome not in ('done', 'retry', 'fail') then
    raise exception using errcode = 'P0001', message = 'invalid_outcome';
  end if;

  select attempts into tries from private.calendar_outbox where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if p_outcome = 'done' then
    update private.calendar_outbox
    set done_at = now(), locked_until = null, last_error = null
    where id = p_id;
  elsif p_outcome = 'fail' or tries >= 6 then
    update private.calendar_outbox
    set failed_at = now(), locked_until = null, last_error = left(p_error, 500)
    where id = p_id;
  else
    update private.calendar_outbox
    set next_attempt_at = now() + (array['1 minute', '5 minutes', '30 minutes', '2 hours', '12 hours'])[tries]::interval,
        locked_until = null,
        last_error = left(p_error, 500)
    where id = p_id;
  end if;
end;
$$;

revoke all on function public.calendar_sync_claim(int) from public, anon, authenticated;
revoke all on function public.calendar_sync_finish(bigint, text, text) from public, anon, authenticated;
grant execute on function public.calendar_sync_claim(int) to service_role;
grant execute on function public.calendar_sync_finish(bigint, text, text) to service_role;

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
      body := '{}'::jsonb
    );
  end if;
end;
$$;

revoke all on function private.calendar_sync_kick() from public, anon, authenticated;

select cron.schedule('calendar-sync-kick', '* * * * *', 'select private.calendar_sync_kick()');
