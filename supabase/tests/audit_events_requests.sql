-- FR-031 and SC-001: every request event, on every route that can make it. The RPC
-- route carries the caller as actor; direct SQL and the secret-key route carry
-- System. A change that is refused writes no entry (US1-8, FR-004).
begin;
select plan(39);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('A20 annual', true, 20) returning id as lt \gset

-- ---- submit through the RPC ----
select tests.as_authenticated(:'emp');
select id from public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08', 'Beach') \gset r1_
select tests.reset_role();

select id from public.audit_log
  where action = 'request_submitted' and entity_id = :'r1_id' \gset s1_

select is((select count(*)::int from public.audit_log where entity_id = :'r1_id'), 1,
  'a submission writes exactly one entry');
select is((select action from public.audit_log where id = :'s1_id'), 'request_submitted',
  'the action names the event');
select is((select (actor_id = :'emp')::text || '/' || (subject_id = :'emp')::text
   from public.audit_log where id = :'s1_id'), 'true/true',
  'the requester is both the actor and the subject');
select is((select actor_role::text || '/' || actor_name
   from public.audit_log where id = :'s1_id'), 'employee/Test employee',
  'the actor role and name are snapshotted from the profile');
select is((select after from public.audit_log where id = :'s1_id'),
  jsonb_build_object('status', 'pending'),
  'after holds the new status and nothing else');
select is((select (context->>'start_date') || '/' || (context->>'end_date') || '/'
   || (context->>'leave_type_name') || '/' || (context->>'working_days') || '/' || (context->>'year')
   from public.audit_log where id = :'s1_id'),
  '2026-09-07/2026-09-08/A20 annual/2.0/2026',
  'context carries the dates, the type name, the working days and the year');
select is(
  ((select created_at from public.audit_log where id = :'s1_id')
   = (select created_at from public.leave_requests where id = :'r1_id')),
  true,
  'the entry is stamped with the request time, not the time the trigger ran');

-- ---- approve through the RPC ----
select tests.as_authenticated(:'mgr');
select public.decide_leave_request(:'r1_id', 'approved', 'Enjoy it');
select tests.reset_role();

select id from public.audit_log
  where action = 'request_approved' and entity_id = :'r1_id' \gset d1_

select is((select count(*)::int from public.audit_log where entity_id = :'r1_id'), 2,
  'the decision adds exactly one entry');
select is((select 'before=' || (before->>'status') || ' after=' || (after->>'status')
   from public.audit_log where id = :'d1_id'), 'before=pending after=approved',
  'the entry holds the status pair');
select is((select actor_role::text || '/' || actor_name || '/' || coalesce(comment, '<none>')
   from public.audit_log where id = :'d1_id'), 'manager/Test manager/Enjoy it',
  'the approver, their role and the decision comment are recorded');
select is(
  ((select created_at from public.audit_log where id = :'d1_id')
   = (select decided_at from public.leave_requests where id = :'r1_id')),
  true,
  'the decision entry is stamped with decided_at');

-- ---- decline through the RPC ----
select tests.as_authenticated(:'emp');
select id from public.submit_leave_request(:'lt', '2026-09-14', '2026-09-15') \gset r2_
select tests.as_authenticated(:'mgr');
select public.decide_leave_request(:'r2_id', 'declined', 'Peak week');
select tests.reset_role();

select is((select action || '/' || (before->>'status') || '/' || (after->>'status')
   || '/' || coalesce(comment, '')
   from public.audit_log where action = 'request_declined' and entity_id = :'r2_id'),
  'request_declined/pending/declined/Peak week',
  'a decline writes request_declined with the same shape');

-- ---- withdraw through the RPC (#175) ----
-- The one event with no approver in it. Before this file's trigger fix the decision arm read
-- `case new.status when 'approved' then 'request_approved' else 'request_declined' end`, so a
-- fourth value in `request_status` fell into the `else`: the requester recorded as having been
-- told no, by themselves. The last assertion below is the one that would have caught it.
select tests.as_authenticated(:'emp');
select id from public.submit_leave_request(:'lt', '2026-09-21', '2026-09-22') \gset r4_
select public.withdraw_leave_request(:'r4_id');
select tests.reset_role();

select id from public.audit_log
  where action = 'request_withdrawn' and entity_id = :'r4_id' \gset w1_

select is((select count(*)::int from public.audit_log where entity_id = :'r4_id'), 2,
  'a withdrawal adds exactly one entry to its own submission');
select is((select action || '/' || (before->>'status') || '/' || (after->>'status')
   from public.audit_log where id = :'w1_id'), 'request_withdrawn/pending/withdrawn',
  'the status pair says the requester closed it');
select is((select (actor_id = :'emp')::text || '/' || (subject_id = :'emp')::text
   || '/' || actor_role::text from public.audit_log where id = :'w1_id'), 'true/true/employee',
  'the actor is the requester, in their own role, with no approver anywhere in the entry');
select is((select comment from public.audit_log where id = :'w1_id'), null,
  'and there is no decision to comment on');
select is((select count(*)::int from public.audit_log
   where action = 'request_declined' and entity_id = :'r4_id'), 0,
  'a withdrawal is not filed as a decline');

-- ---- direct SQL, no caller in the session ----
select tests.create_request(:'adm', '2026-10-05', '2026-10-06') as r3 \gset

select is((select actor_name || '/' || coalesce(actor_id::text, '<null>')
   || '/' || coalesce(actor_role::text, '<null>')
   from public.audit_log where action = 'request_submitted' and entity_id = :'r3'),
  'System/<null>/<null>',
  'a direct insert records System with no actor id or role');

update public.leave_requests
set status = 'approved', decided_by = :'mgr', decided_at = now(), decision_comment = 'sql'
where id = :'r3';

select is((select action || '/' || actor_name || '/' || coalesce(comment, '')
   from public.audit_log where action = 'request_approved' and entity_id = :'r3'),
  'request_approved/System/sql',
  'a direct update records the decision as System');

-- ---- the cancellation leg (#175) ----
-- Two events about one leave, both filed against the leave rather than the row that carries the
-- ask: `entity_id` is the request, the subject is its requester, and the cancellation's own id
-- rides in `context` the way `leave_type_id` does. The four-entry count below also proves the
-- parent's approved -> cancelled update writes no entry of its own, because `audit_decision`
-- only fires from `pending`.
select tests.as_authenticated(:'emp');
select id from public.submit_leave_request(:'lt', '2026-10-12', '2026-10-13') \gset r5_
select tests.as_authenticated(:'mgr');
select public.decide_leave_request(:'r5_id', 'approved', null);
select tests.as_authenticated(:'emp');
select id from public.request_cancellation(:'r5_id', 'Family emergency') \gset c1_
select tests.as_authenticated(:'mgr');
select public.decide_cancellation(:'c1_id', 'approved', 'Go ahead');

-- The other answer, on somebody else's leave: an admin asks, the manager who approved it says no.
select tests.as_authenticated(:'adm');
select id from public.request_cancellation(:'r3', 'Change of plan') \gset c2_
select tests.as_authenticated(:'mgr');
select public.decide_cancellation(:'c2_id', 'declined', 'Keep it booked');
select tests.reset_role();

select id from public.audit_log
  where action = 'cancellation_requested' and entity_id = :'r5_id' \gset q1_
select id from public.audit_log
  where action = 'cancellation_approved' and entity_id = :'r5_id' \gset n1_
select id from public.audit_log
  where action = 'cancellation_declined' and entity_id = :'r3' \gset n2_

select is((select count(*)::int from public.audit_log where entity_id = :'r5_id'), 4,
  'submit, approve, ask, answer: four entries, all filed against the leave');
select is((select action || '/' || (actor_id = :'emp')::text || '/' || (subject_id = :'emp')::text
   from public.audit_log where id = :'q1_id'), 'cancellation_requested/true/true',
  'the ask is the requester''s own act, about their own leave');
-- Every `->>` below stays parenthesised: `->>` and `||` share precedence and associate left, so
-- `a->>'x' || '/' || b->>'y'` parses as `(a->>'x' || '/' || b) ->> 'y'` and fails with
-- `operator does not exist: text ->> unknown` rather than with a syntax error.
select is((select (before->>'status') || '/' || (after->>'status') || '/' || (after->>'cancellation')
   from public.audit_log where id = :'q1_id'), 'approved/approved/requested',
  'an ask changes the cancellation and leaves the leave approved');
select is((select comment from public.audit_log where id = :'q1_id'), 'Family emergency',
  'the reason is the comment');
select is((select context->>'cancellation_id' from public.audit_log where id = :'q1_id'),
  :'c1_id', 'and the ask names itself in context, beside the leave it is about');
select is(
  ((select created_at from public.audit_log where id = :'q1_id')
   = (select requested_at from public.cancellation_requests where id = :'c1_id')),
  true,
  'the ask is stamped with the moment it was opened, not the moment the trigger ran');

select is((select action || '/' || actor_role::text || '/' || coalesce(comment, '')
   from public.audit_log where id = :'n1_id'), 'cancellation_approved/manager/Go ahead',
  'the answer names the approver, their role and their words');
select is((select (after->>'status') || '/' || (after->>'cancellation')
   from public.audit_log where id = :'n1_id'), 'cancelled/approved',
  'the entry describes the leave as the answer left it, because the parent is settled first');
select is(
  ((select created_at from public.audit_log where id = :'n1_id')
   = (select decided_at from public.cancellation_requests where id = :'c1_id')),
  true,
  'the answer is stamped with its own decision time');

select is((select action || '/' || (after->>'status') || '/' || (after->>'cancellation')
   || '/' || coalesce(comment, '') from public.audit_log where id = :'n2_id'),
  'cancellation_declined/approved/declined/Keep it booked',
  'a no says the leave stays approved, and quotes the reason');
select is((select count(*)::int from public.audit_log where entity_id = :'r3'), 4,
  'the admin''s leave carries its ask and its answer beside its two System entries');

-- ---- refused and no-op changes write nothing ----
select tests.as_authenticated(:'mgr');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r1_id', 'declined', 'Second thought'),
  'P0001', 'already_decided', 'a second decision is refused');
select tests.reset_role();
select is((select count(*)::int from public.audit_log where entity_id = :'r1_id'), 2,
  'the refused decision left no entry');

select tests.as_authenticated(:'emp');
select throws_ok(
  format('select public.decide_leave_request(%L, %L)', :'r3', 'approved'),
  'P0001', 'not_allowed', 'an employee cannot decide at all');
select throws_ok(
  format('select public.submit_leave_request(%L, %L, %L)', :'lt', '2026-09-07', '2026-09-08'),
  'P0001', 'overlap', 'an overlapping submission is refused');
select tests.reset_role();
-- Four, not two: this file submits as the employee four times, and every one of those four is
-- accepted -- r1 and r2 go on to be decided, r4 is withdrawn, r5 is cancelled. The refusal below
-- is the fifth attempt, and it is the only one with no entry.
select is(
  (select count(*)::int from public.audit_log
   where action = 'request_submitted' and subject_id = :'emp'),
  4,
  'the refused submission left no entry either');

-- A status write that changes nothing, and a note write: neither is a decision.
update public.leave_requests set status = status where id = :'r2_id';
update public.leave_requests set note = 'Parked' where id = :'r2_id';
select is((select count(*)::int from public.audit_log where entity_id = :'r2_id'), 2,
  'an update that changes nothing and a note-only update write no entry');

-- ---- the new RPCs, refused ----
select tests.as_authenticated(:'emp');
select throws_ok(
  format('select public.request_cancellation(%L, %L)', :'r2_id', 'Too late'),
  'P0001', 'not_cancellable', 'declined leave has nothing to cancel, so no ask is written');
select tests.as_authenticated(:'mgr');
select throws_ok(
  format('select public.decide_cancellation(%L, %L, %L)', :'c1_id', 'declined', 'Changed my mind'),
  'P0001', 'already_decided', 'and an answered ask cannot be answered again');
select tests.reset_role();
select is((select count(*)::int from public.audit_log
   where action like 'cancellation%' and entity_id in (:'r5_id', :'r3')), 4,
  'four cancellation entries in all: two asks and two answers, nothing from either refusal');

select * from finish();
rollback;
