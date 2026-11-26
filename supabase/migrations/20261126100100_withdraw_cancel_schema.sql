-- #175 step 2 of 4: the shapes the two new statuses need, now that they exist and are
-- committed in their own transaction.
--
-- 1. leave_requests' decision-shape check, relaxed so a withdrawn request can say
--    "nobody decided this" without saying "nobody finished with this".
-- 2. cancellation_requests: the ask-to-cancel leg of the feature, in a table of its own.
--
-- The table is the design decision worth arguing with, so it is argued here. An ask to
-- cancel needs a requester, an approver, a yes/no and a comment -- which is exactly the
-- shape leave_requests already stores about its first decision. The alternative was two
-- more columns on that table and a `cancel_requested` status. It was rejected because it
-- rewrites history: approving a cancellation would overwrite `decided_by`, `decided_at` and
-- `decision_comment`, and the person who approved the leave in the first place would
-- disappear from the row. Issue #175's third acceptance criterion says decisions stay final
-- with their audit fields kept; a second set of columns on the child row is what makes that
-- true rather than merely intended. It also leaves the partial exclusion constraint, the
-- balance sums and the team calendar alone, because none of them ever sees a new status.

-- --------------------------------------------------------------------------- 1. the check
--
-- The constraint being replaced was written inline in 20261017000300 and therefore has no
-- name of its own: Postgres gave it `leave_requests_check2`, numbered by the order the
-- table was built in. Referring to that name here would tie this migration to a detail of
-- a file from October, so the constraint is found by what it enforces, and the replacement
-- is named so that later migrations and pgTAP assertions can refer to it without guessing.
do $$
declare
  v_count int;
  v_conname text;
begin
  select count(*), min(conname)
    into v_count, v_conname
    from pg_constraint
   where conrelid = 'public.leave_requests'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%pending%'
     and pg_get_constraintdef(oid) like '%decided_by%';

  if v_count = 0 then
    raise exception
      using errcode = 'P0001',
            message = 'the pending/decision check on leave_requests was not found',
            detail = 'This migration replaces exactly one check constraint. Either it has '
                     'already been replaced, or leave_requests is not the table this file '
                     'was written against.';
  end if;

  if v_count > 1 then
    raise exception
      using errcode = 'P0001',
            message = 'more than one pending/decision check on leave_requests',
            detail = 'Refusing to guess which of ' || v_count || ' constraints to drop.';
  end if;

  execute format('alter table public.leave_requests drop constraint %I', v_conname);
end $$;

-- pending and withdrawn are the two statuses with no approver behind them.
--
-- The `else` arm is the constraint being replaced with its right-hand side negated -- "not
-- (both null)" is De Morgan's "either one is not null" -- so `approved`, `declined` and the new
-- `cancelled` stay bound by exactly what bound them before. Writing it as `and` instead would
-- have looked tidier and been a data migration in disguise: the old check admits a non-pending
-- row carrying only one of the two fields, and `tests.create_request` can produce one.
--
-- A withdrawn request may hold `decided_at`: it is the moment the row stopped being
-- actionable, which is what that column has always meant, and the audit trigger stamps the
-- entry from it. It may not hold `decided_by`, because the person who withdrew it is the
-- requester, and `decided_by <> user_id` (leave_requests_check3) is precisely the guard that
-- stops a withdrawal from being recorded as somebody's approval.
alter table public.leave_requests
  add constraint leave_requests_decision_shape_check check (
    case status
      when 'pending'   then decided_by is null and decided_at is null
      when 'withdrawn' then decided_by is null
      else decided_by is not null or decided_at is not null
    end
  );

-- ---------------------------------------------------------------- 2. cancellation_requests
--
-- One row per ask. `requested_by` is always the parent's `user_id` -- only the requester can
-- ask -- and is stored rather than joined so the child row is self-describing to the audit
-- trigger and to the check that refuses a self-approval, both of which read this table alone.
create table public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.leave_requests (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  reason text check (char_length(reason) <= 500),

  -- The same vocabulary as a request decision, because it is the same event: an approver
  -- answers yes or no. `withdrawn` and `cancelled` describe a request, not an answer, and
  -- the check below is what keeps them out of this column.
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_comment text check (char_length(decision_comment) <= 500),

  check (status in ('pending', 'approved', 'declined')),
  check ((status = 'pending') = (decided_by is null and decided_at is null)),
  -- "An approver (never the requester) approves or declines the cancellation." Kept as data
  -- rather than only as RPC logic so that a privileged write cannot manufacture one.
  check (decided_by <> requested_by)
);

-- At most one open ask per request. A decided one stays, so the history of a request that
-- was asked about twice is still two rows; the partial index is what stops a second ask
-- being queued while the first is still unanswered.
create unique index cancellation_requests_one_open
  on public.cancellation_requests (request_id)
  where (status = 'pending');

create index cancellation_requests_open_for_approver
  on public.cancellation_requests (requested_at)
  where (status = 'pending');

alter table public.cancellation_requests enable row level security;

-- No client writes: the three RPCs in step 4 are the only route in.
revoke insert, update, delete on public.cancellation_requests from anon, authenticated;

-- Logged-out users read nothing.
revoke select on public.cancellation_requests from anon;

-- There is deliberately no select policy in this file. Who may *read* an ask is the approvals
-- page's question (#175's UI half), and the answer is a row of the access matrix with a
-- pgTAP file beside it -- the same shape as row 17 for the approval queue. Until that lands
-- the table is write-only through its RPCs, which is the safe direction for a mistake: a
-- missing policy hides rows, it does not leak them. `rls_enabled.sql` still covers the table,
-- because it sweeps every table in `public` rather than a list someone has to remember.
