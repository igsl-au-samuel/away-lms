-- Spec 002 slice 2, A034 (SC-006, research R7): carrying existing requests over into audit_log.
--
-- This file used to have an allowance half — ten assertions in it — and A046 (migration B) took it
-- out by dropping public.allowance_changes, the table every one of those assertions inserted into
-- or read its expected values from. What replaced that proof is not another test: the guard at the
-- top of 20261118020000_drop_allowance_changes.sql asserts the same carry-over claim against the
-- real rows, at the moment the table goes, and refuses the drop when a row the backfill could have
-- carried has no ac:<id> entry. A synthetic test can only say the mapping works; the guard says it
-- happened here. private.audit_backfill() itself survives, narrowed to leave_requests, which is why
-- everything below still has a function to call.
--
-- private.audit_backfill() lands in migration A3 (A038), and this body runs unguarded from
-- that PR on: the existence check that used to skip it is deleted with the migration that
-- installs the function.
-- (row40 needs no guard of its own: its grant sweep filters on proname like 'audit%', so it
-- covers this function once it exists and quietly covers nothing before it does.)
--
-- Two halves, because the cutoff needs a live entry to measure against and the first half
-- needs the log to have none:
--   1. everything seeded with session_replication_role = replica, so no trigger fires and
--      this file adds no live entry — the backfill must carry over every source row;
--   2. one real live entry, then newer history seeded alongside an older row that arrives
--      after the anchor — the cutoff must skip the newer rows only.
--
-- Every count here is either scoped to the rows this file creates or measured immediately
-- around the call it is about. db:reset leaves audit_log empty, but the local stack is shared
-- between three builder sessions and one of them can seed it: a total row count would then
-- include entries the backfill carried over from somebody else's requests, and would fail for
-- reasons that have nothing to do with the backfill. The fixed 2026 source dates do the same work
-- — they are older than any live entry either state can hold, so this file's rows are in date
-- whether or not the cutoff is empty.
begin;

select plan(28);

-- ---------------------------------------------------------------------------
-- Half 1 — this file writes no live entry, so the backfill has everything to carry over.
-- ---------------------------------------------------------------------------
set local session_replication_role = replica;

select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'QLD', true, true) as demp \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('A34 annual', true, 20)
returning id as lt \gset

-- One pending, one approved, one declined. Dates are fixed and non-overlapping per person,
-- because leave_requests excludes an overlapping pending/approved range for one user.
insert into public.leave_requests
  (user_id, leave_type_id, start_date, end_date, region_code, working_days, status, created_at)
values
  (:'emp', :'lt', date '2026-01-05', date '2026-01-07', 'QLD', 3.0, 'pending',
   timestamptz '2026-01-05 09:00:00+10')
returning id as r_pend \gset

insert into public.leave_requests
  (user_id, leave_type_id, start_date, end_date, region_code, working_days, status,
   created_at, decided_at, decided_by, decision_comment)
values
  (:'emp', :'lt', date '2026-02-10', date '2026-02-12', 'QLD', 3.0, 'approved',
   timestamptz '2026-02-10 09:00:00+10', timestamptz '2026-02-11 10:00:00+10', :'mgr',
   'Approved for team cover')
returning id as r_appr \gset

insert into public.leave_requests
  (user_id, leave_type_id, start_date, end_date, region_code, working_days, status,
   created_at, decided_at, decided_by, decision_comment)
values
  (:'demp', :'lt', date '2026-03-02', date '2026-03-03', 'QLD', 2.0, 'declined',
   timestamptz '2026-03-02 09:00:00+10', timestamptz '2026-03-05 11:00:00+10', :'adm',
   'Clash with the close')
returning id as r_decl \gset

select count(*)::int as live0 from public.audit_log where not is_backfilled \gset
select count(*)::int as null0 from public.audit_log where source_key is null \gset

set local session_replication_role = origin;

select private.audit_backfill();

-- 3 submitted + 2 decisions.
select is((select count(*)::int from public.audit_log
           where entity_id in (:'r_pend', :'r_appr', :'r_decl') and source_key like 'req:%'), 5,
  'SC-006: three requests become five entries, every one of them keyed');

-- The requests.
select is((select count(*)::int from public.audit_log
           where action = 'request_submitted'
             and entity_id in (:'r_pend', :'r_appr', :'r_decl')), 3,
  'one request_submitted entry per seeded request, including the pending one');

select is((select source_key from public.audit_log
           where entity_id = :'r_pend' and action = 'request_submitted'),
          (select 'req:' || id || ':submitted' from public.leave_requests where id = :'r_pend'),
  'source_key is req:<request id>:submitted');

select is((select created_at from public.audit_log
           where entity_id = :'r_pend' and action = 'request_submitted'),
          (select created_at from public.leave_requests where id = :'r_pend'),
  'the entry keeps the request''s own created_at, not the backfill''s');

select ok((select actor_id = :'emp' and subject_id = :'emp'
                and actor_role::text = 'employee' and actor_name = 'Test employee'
           from public.audit_log
           where entity_id = :'r_pend' and action = 'request_submitted'),
  'the requester is both actor and subject, with the role and name they hold now');

select is((select (before is null)::text || '/' || (after->>'status') from public.audit_log
           where entity_id = :'r_pend' and action = 'request_submitted'), 'true/pending',
  'a submitted entry has no before value and after.status = pending');

select is((select (context->>'leave_type_name') || '/' || (context->>'year')
                || '/' || (context->>'start_date') || '/' || (context->>'end_date')
                || '/' || (context->>'working_days')
           from public.audit_log
           where entity_id = :'r_pend' and action = 'request_submitted'),
  'A34 annual/2026/2026-01-05/2026-01-07/3.0',
  'context carries the type name, year, dates and working days');

select is((select entity from public.audit_log
           where entity_id = :'r_pend' and action = 'request_submitted'), 'leave_request',
  'the entity of a request entry is leave_request');

select is((select count(*)::int from public.audit_log
           where source_key like 'req:%:decided'
             and entity_id in (:'r_appr', :'r_decl')), 2,
  'one decision entry per decided request, and none for the pending one');

select is((select action || '/' || (before->>'status') || '/' || (after->>'status')
           from public.audit_log where entity_id = :'r_appr' and source_key like '%:decided'),
  'request_approved/pending/approved', 'the approved row reads pending to approved');

select is((select created_at from public.audit_log
           where entity_id = :'r_appr' and source_key like '%:decided'),
          (select decided_at from public.leave_requests where id = :'r_appr'),
  'a decision entry is dated decided_at, not the request''s created_at');

select ok((select actor_id = :'mgr' and actor_role::text = 'manager'
                and actor_name = 'Test manager' and subject_id = :'emp'
           from public.audit_log where entity_id = :'r_appr' and source_key like '%:decided'),
  'the decider is the actor and the requester stays the subject');

select is((select comment from public.audit_log
           where entity_id = :'r_appr' and source_key like '%:decided'),
  'Approved for team cover', 'decision_comment becomes the entry comment');

select is((select action || '/' || (after->>'status') from public.audit_log
           where entity_id = :'r_decl' and source_key like '%:decided'),
  'request_declined/declined', 'the declined row reads declined');

select is((select comment from public.audit_log
           where entity_id = :'r_decl' and source_key like '%:decided'),
  'Clash with the close', 'the declined comment is carried over too');

select is((select count(*)::int from public.audit_log
           where entity_id = :'r_pend' and source_key like '%:decided'), 0,
  'a pending request writes no decision entry');

-- What the backfill must not do.
select is((select count(*)::int from public.audit_log where not is_backfilled) - :live0, 0,
  'R7: the backfill inserts directly, so it writes no live entry that a trigger could duplicate');

select is((select count(*)::int from public.audit_log where source_key is null) - :null0, 0,
  'every entry it wrote carries an idempotency key');

select ok((select count(*)::int = 2 and bool_and(is_demo)
           from public.audit_log where entity_id = :'r_decl'),
  'FR-010: both entries about the demo requester are demo-marked');

select is((select count(*)::int from public.audit_log
           where is_demo and subject_id in (:'emp', :'adm', :'mgr')), 0,
  'and no entry about a real person is');

-- SC-006: re-running must be a no-op. Measured immediately around the call, so a database
-- another session has seeded cannot move it.
select count(*)::int as t1 from public.audit_log \gset
select private.audit_backfill();

select is((select count(*)::int from public.audit_log) - :t1, 0,
  'SC-006: running the backfill a second time adds nothing');

-- ---------------------------------------------------------------------------
-- Half 2 — the cutoff. One live entry makes min(created_at) over the non-backfilled rows
-- real, and that value is the boundary the backfill must respect.
-- ---------------------------------------------------------------------------
select count(*)::int as live1 from public.audit_log where not is_backfilled \gset
select tests.create_user('employee', 'QLD') as anchor \gset

select is((select count(*)::int from public.audit_log where not is_backfilled) - :live1, 1,
  'a live entry now exists, and it is what the cutoff measures against');

-- now() is the transaction timestamp, so it is the same value in the anchor and in every
-- row below: the anchor sits exactly on the boundary and these sit either side of it.
set local session_replication_role = replica;

insert into public.leave_requests
  (user_id, leave_type_id, start_date, end_date, region_code, working_days, status, created_at)
values
  (:'emp', :'lt', date '2026-06-01', date '2026-06-02', 'QLD', 2.0, 'pending',
   now() + interval '1 day')
returning id as r_newer \gset

insert into public.leave_requests
  (user_id, leave_type_id, start_date, end_date, region_code, working_days, status,
   created_at, decided_at, decided_by, decision_comment)
values
  (:'emp', :'lt', date '2026-07-01', date '2026-07-02', 'QLD', 2.0, 'approved',
   now() - interval '40 days', now() + interval '1 day', :'adm', 'Late decision')
returning id as r_split \gset

insert into public.leave_requests
  (user_id, leave_type_id, start_date, end_date, region_code, working_days, status, created_at)
values
  (:'mgr', :'lt', date '2026-08-01', date '2026-08-02', 'QLD', 2.0, 'pending',
   now() - interval '40 days')
returning id as r_older \gset

set local session_replication_role = origin;

-- Measured here, after the anchor: the cutoff run must add no live entry of its own.
select count(*)::int as live2 from public.audit_log where not is_backfilled \gset
select private.audit_backfill();

select is((select count(*)::int from public.audit_log
           where entity_id = :'r_newer'), 0,
  'R7 cutoff: a request newer than the first live entry writes no entry at all');

select is((select count(*)::int from public.audit_log
           where entity_id = :'r_split' and source_key like '%:submitted'), 1,
  'the same request''s older submitted half is backfilled');

select is((select count(*)::int from public.audit_log
           where entity_id = :'r_split' and source_key like '%:decided'), 0,
  'and its decision dated after the cutoff is not: the gate is per entry time, not per row');

select is((select count(*)::int from public.audit_log
           where entity_id = :'r_older' and source_key like '%:submitted'), 1,
  'a row older than the cutoff but written after it is still backfilled: the gate reads the row''s own time');

select is((select count(*)::int from public.audit_log
           where source_key in (
             'req:' || :'r_newer' || ':submitted',
             'req:' || :'r_split' || ':submitted',
             'req:' || :'r_split' || ':decided',
             'req:' || :'r_older' || ':submitted')), 2,
  'of these four source entries exactly the two in date were carried over, the two newer ones were not');

select is((select count(*)::int from public.audit_log where not is_backfilled) - :live2, 0,
  'the backfill still wrote no live entry of its own');

select * from finish();
rollback;
