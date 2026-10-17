-- Access matrix row 15: decide_leave_request where the requester is an admin.
-- Manager can decide; the admin deciding their own gets own_request. A second
-- admin cannot decide it (database-api.md: admins decide employees and managers).
begin;
select plan(8);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset
select tests.create_user('admin', 'QLD') as adm2 \gset
select tests.create_user('manager', 'NSW', false) as off \gset

select tests.create_request(:'adm', '2026-09-07', '2026-09-08') as r_mgr \gset
select tests.create_request(:'adm', '2026-09-14', '2026-09-15') as r_open \gset

select tests.as_authenticated(:'mgr');
select is(
  (select status::text || '/' || decided_by::text from public.decide_leave_request(:'r_mgr', 'declined', 'Coverage')),
  'declined/' || :'mgr',
  'manager can decide an admin request'
);

select tests.as_authenticated(:'adm');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_open', 'approved', null),
  'P0001', 'own_request', 'admin deciding their own request gets own_request'
);

select tests.as_authenticated(:'adm2');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_open', 'approved', null),
  'P0001', 'not_allowed', 'another admin cannot decide an admin request'
);

select tests.as_authenticated(:'emp');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_open', 'approved', null),
  'P0001', 'not_allowed', 'employee refused'
);

select tests.as_authenticated(:'off');
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_open', 'approved', null),
  'P0001', 'not_allowed', 'inactive manager refused'
);

select tests.as_authenticated(gen_random_uuid());
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_open', 'approved', null),
  'P0001', 'not_allowed', 'a user with no profile is refused'
);

select tests.as_anon();
select throws_ok(
  format('select public.decide_leave_request(%L, %L, %L)', :'r_open', 'approved', null),
  '42501', null, 'anon: not executable'
);

select tests.reset_role();
select is(
  (select status::text from public.leave_requests where id = :'r_open'),
  'pending',
  'refused calls left the request pending'
);

select * from finish();
rollback;
