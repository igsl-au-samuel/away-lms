-- US3-1, US3-2, FR-020, FR-021: what a decision stores and how the queue reports
-- balance. Errors: invalid_outcome, not_found.
begin;
select plan(14);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Dec annual', true, 10) returning id as annual \gset
insert into public.leave_types (name, is_capped, default_allowance)
values ('Dec unpaid', false, null) returning id as unpaid \gset

-- 10 allowance. 4 approved earlier, 5 pending (approve it), 4 pending (decline it).
select tests.create_request(:'emp', '2026-02-02', '2026-02-05', 'approved', :'mgr', 4, :'annual');
select tests.create_request(:'emp', '2026-03-02', '2026-03-06', 'pending', null, 5, :'annual') as r_appr \gset
select tests.create_request(:'emp', '2026-04-06', '2026-04-09', 'pending', null, 4, :'annual') as r_decl \gset
select tests.create_request(:'emp', '2026-05-04', '2026-05-04', 'pending', null, 1, :'unpaid') as r_unc \gset
-- The 4-day request was 3 days over balance when submitted: 10 - (4 + 5) = 1 available, 4 asked.
update public.leave_requests set over_balance_days = 3 where id = :'r_decl';

select tests.create_request(:'emp', '2026-06-01', '2026-06-01', 'pending', null, 1, :'unpaid') as r_new \gset
select tests.as_authenticated(:'mgr');

-- approval_queue: available_now and the over-balance flag.
select is(
  (select available_now from public.approval_queue() where id = :'r_appr'),
  -3.0::numeric,
  'available_now is the requester''s current balance (10 - 4 - 5 - 4 = -3)'
);
select is(
  (select over_balance_days from public.approval_queue() where id = :'r_decl'),
  3.0::numeric,
  'the over-balance flag is the figure stored at submission'
);
select is(
  (select over_balance_days from public.approval_queue() where id = :'r_appr'),
  null,
  'a request within balance has no flag'
);
select is(
  (select available_now is null and not is_capped from public.approval_queue() where id = :'r_unc'),
  true,
  'an uncapped type has no available_now'
);
select is(
  (select requester_name || '/' || leave_type_name || '/' || working_days::text
   from public.approval_queue() where id = :'r_appr'),
  'Test employee/Dec annual/5.0',
  'queue rows carry requester, type and working days'
);

-- US3-1: approve.
select is(
  (select status::text || '/' || (decided_by = :'mgr')::text || '/' || (decided_at is not null)::text
          || '/' || decision_comment
   from public.decide_leave_request(:'r_appr', 'approved', '  Have a good one  ')),
  'approved/true/true/Have a good one',
  'approve records status, decider, time and the trimmed comment'
);
select is(
  (select taken::text || '/' || pending::text
   from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'annual'),
  '9.0/4.0',
  'approve moves 5 days from pending to taken'
);

-- US3-2: decline.
select is(
  (select status::text || '/' || decision_comment
   from public.decide_leave_request(:'r_decl', 'declined', 'Team is short')),
  'declined/Team is short',
  'decline keeps the comment'
);
select is(
  (select taken::text || '/' || pending::text || '/' || available::text
   from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'annual'),
  '9.0/0.0/1.0',
  'decline returns the days'
);

-- No comment is stored as null, not an empty string.
select is(
  (select decision_comment is null from public.decide_leave_request(:'r_unc', 'approved', '   ')),
  true,
  'a blank comment is stored as null'
);

-- Errors.
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_new', 'pending', null),
  'P0001', 'invalid_outcome', 'pending is not an outcome'
);
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', gen_random_uuid(), 'approved', null),
  'P0001', 'not_found', 'an unknown request id is not_found'
);

select tests.reset_role();
select is(
  (select status::text from public.leave_requests where id = :'r_new'),
  'pending',
  'invalid_outcome left the request pending'
);

-- The status cannot be changed by hand either: still no client writes.
select tests.as_authenticated(:'mgr');
select throws_ok(
  format('update public.leave_requests set status = %L where id = %L', 'approved', :'r_new'),
  '42501', null, 'no direct update on leave_requests'
);

select * from finish();
rollback;
