-- A046 (spec 002 slice 2b, migration B): `allowance_changes` stops existing. A039 stopped writing
-- it and promised this file would drop it (20261117031500_audit_allowance_swap.sql:5), A040-A043
-- moved the last readers onto `audit_log`, and A045 read production before any of that was
-- allowed to start: `old_rows = 0`, `backfilled = 0` (#310), so that deployment loses nothing.
--
-- `drop table` without `cascade`, deliberately. The catalog says nothing depends on this table: no
-- foreign key points at it, no view is built on it, its only index is its own primary key, its one
-- policy and its owned sequence go with it, and A039 removed the last trigger. A cascade would be
-- an untested wildcard, so if a later deploy turns up a dependent object this migration fails and
-- names it instead of quietly deleting somebody's viewer.
--
-- What pg_depend cannot see is a function body, and there is exactly one: private.audit_backfill()
-- reads `from public.allowance_changes` twice (20261117022917_audit_backfill.sql:133,164). A plpgsql
-- body is not parsed until it runs, so the drop would succeed and leave a `security definer`
-- function that raises 42P01 the first time anyone calls it — a trap rather than a tool.
--
-- It is narrowed here rather than dropped, and the reason is the 39 assertions in
-- supabase/tests/audit_backfill.sql. Half of them are about `leave_requests`, a table that survives
-- this PR, and they test the part of the carry-over that is still a live risk on any database
-- upgrading later: the cutoff that stops the log doubling itself (decision 3), the idempotency key
-- that makes a re-run a no-op (SC-006), and FR-010's demo marking. Dropping the function would
-- take that proof with it, because the file calls nothing else. Dropping the two allowance
-- branches takes only what is already impossible to carry: their source table is this statement.
-- The header's own reason for keeping the function — "a deploy that failed part-way can be finished
-- from SQL" (20261117022917_audit_backfill.sql:173-175) — still holds for requests and no longer
-- holds for allowances, which is exactly the line this file draws.

-- ---------------------------------------------------------------------------
-- The guard. A drop is the one migration the next one cannot undo, so this re-checks A045's claim
-- from the inside, at the moment the table goes.
--
-- It is not `old_rows = backfilled`, and that is the trap in the naive version: two totals can
-- agree while the rows that matter do not. The count that has to be zero is narrower — a row the
-- backfill *could* have carried and did not. Two exclusions come straight out of `audit_backfill()`
-- itself, and a guard without them aborts every database that has real history:
--
--   * the cutoff (20261117022917_audit_backfill.sql:40): at or after the first live entry the
--     triggers own the row, so the backfill skipped it on purpose and no `ac:` key exists by design;
--   * the joins (20261117022917_audit_backfill.sql:134-136,165-166): they are inner joins onto
--     `profiles` for the actor, onto `profiles` for the subject when there is one, and onto
--     `leave_types`. A row whose admin has since been deleted, or whose type is gone, was never
--     carryable — that history cannot be reconstructed from a profile that no longer exists, and
--     inventing one is the false record FR-005 forbids. Such a row is reported, not blocked: it
--     goes with the table either way, and a drop guard is not where that gets decided.
--
-- The abort is the useful path. It rolls the transaction back, which leaves the table *and* the
-- still-whole A038 function installed, so the remedy the message gives is callable at exactly the
-- moment it is read.
do $$
declare
  v_total     bigint;
  v_carryable bigint;
  v_missing   bigint;
begin
  select count(*) into v_total from public.allowance_changes;

  with cutoff as (
    select min(created_at) as at from public.audit_log where not is_backfilled
  ),
  eligible as (
    select exists (
      select 1 from public.audit_log al where al.source_key = 'ac:' || ac.id
    ) as carried
    from public.allowance_changes ac
    cross join cutoff c
    where (c.at is null or ac.changed_at < c.at)
      and exists (select 1 from public.profiles a where a.id = ac.changed_by)
      and exists (select 1 from public.leave_types lt where lt.id = ac.leave_type_id)
      and (ac.user_id is null
           or exists (select 1 from public.profiles u where u.id = ac.user_id))
  )
  select count(*) filter (where not carried), count(*) into v_missing, v_carryable
  from eligible;

  if v_missing > 0 then
    raise exception using errcode = 'P0001',
      message = format('allowance_changes: %s of %s carryable rows have no ac:<id> entry in audit_log',
                       v_missing, v_carryable),
      detail = 'Run select private.audit_backfill(); and re-apply this migration. Nothing was dropped: this transaction aborted, and the function still has its allowance branches.',
      hint = format('%s rows in the table, %s of them carryable — the rest are at or after the live cutoff (%s) or name a profile or leave type that no longer exists.',
                    v_total, v_carryable,
                    coalesce((select min(created_at)::text from public.audit_log where not is_backfilled), 'no live entry yet'));
  end if;
end $$;

-- The carry-over, narrowed to the source that survives. Everything below this line, from `returns
-- void` (20261117022917_audit_backfill.sql:30) through the request decision's `on conflict` (:105)
-- and its closing `end;` / `$$;` (:170-171), is byte for byte what A038 installed: the diff of
-- those two regions comes back empty, 78 lines against 78. Two things are not identical, and both
-- are deliberate. The header line becomes `create or replace function`, because the function is
-- already on `main` and a plain `create` would fail at it. The two allowance inserts (:106-169) are
-- gone, because their source table is this migration's own `drop table`.
create or replace function private.audit_backfill()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Null on a database where no trigger has written yet, which is the fresh-install case where
  -- the whole history is in date.
  v_cutoff timestamptz;
begin
  select min(created_at) into v_cutoff from public.audit_log where not is_backfilled;

  -- request_submitted: one per request, pending ones included, dated when it was asked for.
  insert into public.audit_log (
    created_at, actor_id, actor_role, actor_name,
    action, entity, entity_id, subject_id, subject_name,
    before, after, context, comment, is_demo, is_backfilled, source_key
  )
  select
    r.created_at,
    u.id, u.role, u.full_name,
    'request_submitted', 'leave_request', r.id, r.user_id, u.full_name,
    null,
    jsonb_build_object('status', r.status),
    jsonb_build_object(
      'leave_type_id', r.leave_type_id,
      'leave_type_name', lt.name,
      'year', extract(year from r.start_date)::int,
      'start_date', r.start_date,
      'end_date', r.end_date,
      'working_days', r.working_days
    ),
    null,
    u.is_demo,
    true,
    'req:' || r.id || ':submitted'
  from public.leave_requests r
  join public.profiles u on u.id = r.user_id
  join public.leave_types lt on lt.id = r.leave_type_id
  where v_cutoff is null or r.created_at < v_cutoff
  on conflict (source_key) where source_key is not null do nothing;

  -- The decision. leave_requests' own check constraint ties status = 'pending' to a null
  -- decider, so anything not pending has both decided_by and decided_at. The actor is the
  -- person who decided; the subject stays the requester.
  insert into public.audit_log (
    created_at, actor_id, actor_role, actor_name,
    action, entity, entity_id, subject_id, subject_name,
    before, after, context, comment, is_demo, is_backfilled, source_key
  )
  select
    r.decided_at,
    d.id, d.role, d.full_name,
    case r.status when 'approved' then 'request_approved' else 'request_declined' end,
    'leave_request', r.id, r.user_id, u.full_name,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', r.status),
    jsonb_build_object(
      'leave_type_id', r.leave_type_id,
      'leave_type_name', lt.name,
      'year', extract(year from r.start_date)::int,
      'start_date', r.start_date,
      'end_date', r.end_date,
      'working_days', r.working_days
    ),
    r.decision_comment,
    u.is_demo,
    true,
    'req:' || r.id || ':decided'
  from public.leave_requests r
  join public.profiles u on u.id = r.user_id
  join public.profiles d on d.id = r.decided_by
  join public.leave_types lt on lt.id = r.leave_type_id
  where r.status <> 'pending'
    and (v_cutoff is null or r.decided_at < v_cutoff)
  on conflict (source_key) where source_key is not null do nothing;
end;
$$;

-- Unchanged from A038 (20261117022917_audit_backfill.sql:176), and restated rather than assumed:
-- `create or replace` keeps an existing ACL, but the signature is the thing row40's sweep asserts
-- about, and it is worth the one line to say out loud that narrowing the body moved no grant.
revoke all on function private.audit_backfill() from public, anon, authenticated, service_role;

drop table public.allowance_changes;
