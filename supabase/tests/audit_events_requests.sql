-- FR-031 and SC-001: every request event, on every route that can make it. The RPC
-- route carries the caller as actor; direct SQL and the secret-key route carry
-- System. A change that is refused writes no entry (US1-8, FR-004).
begin;
select plan(20);

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
select is(
  (select count(*)::int from public.audit_log
   where action = 'request_submitted' and subject_id = :'emp'),
  2,
  'the refused submission left no entry either');

-- A status write that changes nothing, and a note write: neither is a decision.
update public.leave_requests set status = status where id = :'r2_id';
update public.leave_requests set note = 'Parked' where id = :'r2_id';
select is((select count(*)::int from public.audit_log where entity_id = :'r2_id'), 2,
  'an update that changes nothing and a note-only update write no entry');

select * from finish();
rollback;
