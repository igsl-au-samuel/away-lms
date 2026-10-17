-- Access matrix row 13: decide_leave_request where the requester is an employee.
-- Manager and admin can decide; employee, inactive and anon are refused.
begin;
select plan(9);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'QLD') as emp2 \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset
select tests.create_user('manager', 'NSW', false) as off \gset

select tests.create_request(:'emp', '2026-09-07', '2026-09-08') as r_mgr \gset
select tests.create_request(:'emp', '2026-09-14', '2026-09-15') as r_adm \gset
select tests.create_request(:'emp', '2026-09-21', '2026-09-22') as r_refused \gset

select has_function(
  'public', 'decide_leave_request', array['uuid', 'request_status', 'text'],
  'decide_leave_request(request, outcome, comment) exists'
);

select tests.as_authenticated(:'mgr');
select is(
  (select status::text from public.decide_leave_request(:'r_mgr', 'approved', 'Enjoy')),
  'approved',
  'manager can decide an employee request'
);

select tests.as_authenticated(:'adm');
select is(
  (select status::text from public.decide_leave_request(:'r_adm', 'declined', 'Busy week')),
  'declined',
  'admin can decide an employee request'
);

select tests.as_authenticated(:'emp');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_refused', 'approved', null),
  'P0001', 'not_allowed', 'employee cannot decide their own request'
);

select tests.as_authenticated(:'emp2');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_refused', 'approved', null),
  'P0001', 'not_allowed', 'employee cannot decide a colleague''s request'
);

select tests.as_authenticated(:'off');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_refused', 'approved', null),
  'P0001', 'not_allowed', 'inactive manager refused'
);

select tests.as_authenticated(gen_random_uuid());
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_refused', 'approved', null),
  'P0001', 'not_allowed', 'a user with no profile is refused'
);

select tests.as_anon();
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_refused', 'approved', null),
  '42501', null, 'anon: not executable'
);

select tests.reset_role();
select is(
  (select status::text from public.leave_requests where id = :'r_refused'),
  'pending',
  'refused calls left the request pending'
);

select * from finish();
rollback;
