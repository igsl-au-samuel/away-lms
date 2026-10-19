-- team_calendar behaviour: pending and approved rows overlapping the range come
-- back, declined ones do not (US4-4); a deactivated user's leave stays, marked
-- is_active = false (US6-2); partial overlaps at the edges of the range count.
begin;
select plan(10);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'HK') as emp2 \gset
select tests.create_user('employee', 'NSW', false) as gone \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('employee', 'QLD') as emp3 \gset
select tests.create_user('employee', 'QLD') as emp4 \gset

-- Range under test: 2026-09-10 .. 2026-09-20. r_edge_start ends on the first day, r_edge_end
-- starts on the last day, r_gone spans the whole range, r_before and r_after miss it by a day.
select tests.create_request(:'emp', '2026-09-14', '2026-09-15') as r_in \gset
select tests.create_request(:'emp', '2026-09-16', '2026-09-16', 'approved', :'mgr') as r_approved \gset
select tests.create_request(:'emp', '2026-09-17', '2026-09-17', 'declined', :'mgr') as r_declined \gset
select tests.create_request(:'emp2', '2026-09-08', '2026-09-10') as r_edge_start \gset
select tests.create_request(:'emp4', '2026-09-20', '2026-09-20') as r_edge_end \gset
select tests.create_request(:'gone', '2026-09-01', '2026-09-30', 'approved', :'mgr') as r_gone \gset
select tests.create_request(:'emp3', '2026-09-01', '2026-09-09') as r_before \gset
select tests.create_request(:'emp4', '2026-09-21', '2026-09-23') as r_after \gset

select tests.as_authenticated(:'mgr');

create temp table result as
select * from public.team_calendar('2026-09-10', '2026-09-20');
grant select on result to authenticated;

select ok(exists (select 1 from result where request_id = :'r_in' and status = 'pending'),
  'a pending request inside the range is returned');
select ok(exists (select 1 from result where request_id = :'r_approved' and status = 'approved'),
  'an approved request inside the range is returned');
select ok(not exists (select 1 from result where request_id = :'r_declined'),
  'a declined request is not returned');
select ok(exists (select 1 from result where request_id = :'r_edge_start'),
  'a request ending on the first day of the range is returned');
select ok(exists (select 1 from result where request_id = :'r_edge_end'),
  'a request starting on the last day of the range is returned');
select ok(exists (select 1 from result where request_id = :'r_gone'),
  'a request spanning the whole range is returned');
select ok(not exists (select 1 from result where request_id in (:'r_before', :'r_after')),
  'requests ending the day before or starting the day after are not returned');
select is(
  (select is_active from result where request_id = :'r_gone'),
  false,
  'a deactivated user''s leave is returned with is_active = false'
);
select is(
  (select region_code from result where request_id = :'r_edge_start'),
  'HK',
  'the row carries the person''s region'
);
select is(
  (select start_date || '..' || end_date from result where request_id = :'r_edge_start'),
  '2026-09-08..2026-09-10',
  'dates are returned in full, not clipped to the range'
);

select * from finish();
rollback;
