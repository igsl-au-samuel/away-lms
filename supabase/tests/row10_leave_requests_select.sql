-- Access matrix row 10: leave_requests select. Employees see their own rows;
-- managers and admins see all; inactive users and anon see none.
begin;
select plan(9);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'NSW') as emp2 \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

select tests.create_request(:'emp', '2026-03-02', '2026-03-04') as r1 \gset
select tests.create_request(:'emp', '2026-04-13', '2026-04-14', 'approved', :'mgr') as r2 \gset
select tests.create_request(:'emp2', '2026-03-02', '2026-03-03') as r3 \gset
select tests.create_request(:'mgr', '2026-05-11', '2026-05-11', 'approved', :'adm') as r4 \gset
select tests.create_request(:'off', '2026-06-01', '2026-06-02') as r5 \gset

create temp table fixture_ids as
  select unnest(array[:'r1', :'r2', :'r3', :'r4', :'r5']::uuid[]) as id;
grant select on fixture_ids to authenticated, anon;

select tests.as_authenticated(:'emp');
select is(
  (select count(*)::int from public.leave_requests where id in (select id from fixture_ids)),
  2,
  'employee sees their own two requests'
);
select is(
  (select count(*)::int from public.leave_requests where user_id <> :'emp'),
  0,
  'employee sees nobody else''s requests'
);

select tests.as_authenticated(:'emp2');
select is(
  (select array_agg(id) from public.leave_requests where id in (select id from fixture_ids)),
  array[:'r3']::uuid[],
  'another employee sees only their own request'
);

select tests.as_authenticated(:'mgr');
select is(
  (select count(*)::int from public.leave_requests where id in (select id from fixture_ids)),
  5,
  'manager sees all requests'
);
select ok(
  exists (select 1 from public.leave_requests where id = :'r5'),
  'manager sees an inactive user''s request'
);

select tests.as_authenticated(:'adm');
select is(
  (select count(*)::int from public.leave_requests where id in (select id from fixture_ids)),
  5,
  'admin sees all requests'
);

select tests.as_authenticated(:'off');
select is(
  (select count(*)::int from public.leave_requests),
  0,
  'inactive user sees none, not even their own'
);

select tests.as_authenticated(gen_random_uuid());
select is(
  (select count(*)::int from public.leave_requests),
  0,
  'a user with no profile sees none'
);

select tests.as_anon();
select throws_ok(
  'select count(*) from public.leave_requests',
  '42501', null, 'anon cannot read leave_requests'
);

select * from finish();
rollback;
