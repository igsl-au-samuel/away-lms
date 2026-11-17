-- Spec 002 slice 3, A051: access matrix row 42 — what `audit_my_history` hands each role.
--
-- public.audit_my_history(...) lands in migration A5 (A055). Until it exists every assertion
-- below would only prove that a missing function is missing, so the whole body skips and the
-- file stays green on main (decision 7). A055 deletes the guard and has to show these
-- assertions failing against main first.
--
-- Row 42 is a contract about the *function*, not about the policy. RLS already lets an admin
-- read every entry (row 29 proves it, and assertion 14 re-proves it here against the rows this
-- file made), so an admin's count of 0 is only meaningful next to that: it is the page being
-- narrowed to a person's own trail, which is what FR-023 asks for and nothing the policy does.
--
-- Every count here is keyed to entry ids this file created. The local stack is shared between
-- three builder sessions, so a total would include somebody else's audit rows and fail for a
-- reason that has nothing to do with history paging.
begin;

select to_regprocedure('public.audit_my_history(timestamptz, bigint, integer)') is null
  as history_missing \gset

\if :history_missing
select plan(1);
select ok(true, 'public.audit_my_history() lands in A055; the assertions below skip until it exists');
\else

select plan(16);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('manager', 'NSW') as mgr2 \gset
select tests.create_user('admin', 'HK') as adm \gset
select tests.create_user('employee', 'QLD', false) as empoff \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row42 annual', true, 20) returning id as lt \gset

-- An employee's request, approved by the QLD manager: two entries about the employee.
select tests.as_authenticated(:'emp');
select id from public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08') \gset r1_
select tests.as_authenticated(:'mgr');
select public.decide_leave_request(:'r1_id', 'approved', 'Enjoy');

-- A second manager's own request: the entry no other manager may reach.
select tests.as_authenticated(:'mgr2');
select id from public.submit_leave_request(:'lt', '2026-09-21', '2026-09-22') \gset r2_

-- The admin's own request, declined by the other manager.
select tests.as_authenticated(:'adm');
select id from public.submit_leave_request(:'lt', '2026-10-05', '2026-10-06') \gset r3_
select tests.as_authenticated(:'mgr2');
select public.decide_leave_request(:'r3_id', 'declined', 'Peak season');

-- An override for the employee (an `allowance` entry, subject = employee) and a change to the
-- shared default (a `leave_type` entry with no subject), which belongs to everybody.
select tests.as_authenticated(:'adm');
select public.admin_set_allowance(:'emp', :'lt', 2026, 25, 'Long service');
update public.leave_types set default_allowance = 21 where id = :'lt';
select tests.reset_role();

select id from public.audit_log
  where action = 'request_submitted' and entity_id = :'r1_id' \gset s1_
select id from public.audit_log
  where action = 'request_approved' and entity_id = :'r1_id' \gset d1_
select id from public.audit_log
  where action = 'request_submitted' and entity_id = :'r2_id' \gset s2_
select id from public.audit_log
  where action = 'request_submitted' and entity_id = :'r3_id' \gset s3_
select id from public.audit_log
  where action = 'request_declined' and entity_id = :'r3_id' \gset d3_
select id from public.audit_log
  where action = 'allowance_set' and subject_id = :'emp' \gset al_
select id from public.audit_log
  where action = 'leave_type_default_changed' and entity_id = :'lt' \gset dc_

select is(
  (select count(*)::int from public.audit_log
   where id in (:'s1_id', :'d1_id', :'s2_id', :'s3_id', :'d3_id', :'al_id', :'dc_id')),
  7,
  'the seven entries this file asks about were all written'
);

-- ---- employee: their own trail plus the change that applies to everybody ----
select tests.as_authenticated(:'emp');
select is((select count(*)::int from public.audit_my_history() where id = :'s1_id'), 1,
  'an employee sees their own submission');
select is((select count(*)::int from public.audit_my_history() where id = :'d1_id'), 1,
  'an employee sees the decision made on their request, though they did not make it');
select is((select count(*)::int from public.audit_my_history() where id = :'al_id'), 1,
  'an employee sees the allowance override set about them');
select is((select count(*)::int from public.audit_my_history() where id = :'dc_id'), 1,
  'an employee sees the leave-type default change, which belongs to everyone');
select is((select count(*)::int from public.audit_my_history()
           where id in (:'s2_id', :'s3_id', :'d3_id')), 0,
  'an employee sees nothing of another person''s trail, manager or admin');
select tests.reset_role();

-- ---- manager: their own trail, the default change, and everyone they decide for ----
select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.audit_my_history() where id = :'d1_id'), 1,
  'a manager sees the decision they made');
select is((select count(*)::int from public.audit_my_history()
           where id in (:'s1_id', :'al_id')), 2,
  'a manager sees an employee''s request trail, which they could have decided');
select is((select count(*)::int from public.audit_my_history()
           where id in (:'s3_id', :'d3_id')), 2,
  'a manager sees the admin''s request trail, whose requests they also decide');
select is((select count(*)::int from public.audit_my_history() where id = :'dc_id'), 1,
  'a manager sees the leave-type default change');
select is((select count(*)::int from public.audit_my_history() where id = :'s2_id'), 0,
  'a manager sees no entry about another manager, whom they cannot decide for');
select tests.reset_role();

-- ---- admin: their own trail only, which is narrower than the policy allows ----
select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.audit_my_history()
           where id in (:'s3_id', :'al_id', :'dc_id')), 3,
  'the admin sees their own submission, the override they set and the default they changed');
select is((select count(*)::int from public.audit_my_history()
           where id in (:'s1_id', :'d1_id', :'s2_id')), 0,
  'and not one colleague''s trail, even though they are the admin');
select is((select count(*)::int from public.audit_log
           where id in (:'s1_id', :'d1_id', :'s2_id')), 3,
  'the same admin reads all three straight from the table, so the zero above is the function '
  'narrowing the page and not the policy withholding rows');
select tests.reset_role();

-- ---- who gets nothing ----
select tests.as_authenticated(:'empoff');
select is((select count(*)::int from public.audit_my_history()), 0,
  'an inactive caller gets no rows rather than an error');
select tests.reset_role();

select tests.as_anon();
select throws_ok(
  'select count(*) from public.audit_my_history()',
  '42501', null, 'anon is refused outright, not shown an empty page'
);
select tests.reset_role();

\endif
select * from finish();
rollback;