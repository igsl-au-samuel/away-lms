-- Access matrix row 17: approval_queue. A manager sees pending employee and admin
-- requests; an admin sees pending employee and manager requests; never their own,
-- never decided ones. Employee, inactive and anon are refused.
begin;
select plan(9);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('manager', 'QLD') as mgr2 \gset
select tests.create_user('admin', 'HK') as adm \gset
select tests.create_user('admin', 'QLD') as adm2 \gset
select tests.create_user('manager', 'NSW', false) as off \gset

select tests.create_request(:'emp', '2026-09-07', '2026-09-08') as r_emp \gset
select tests.create_request(:'mgr', '2026-09-07', '2026-09-08') as r_mgr \gset
select tests.create_request(:'mgr2', '2026-09-07', '2026-09-08') as r_mgr2 \gset
select tests.create_request(:'adm', '2026-09-07', '2026-09-08') as r_adm \gset
select tests.create_request(:'adm2', '2026-09-07', '2026-09-08') as r_adm2 \gset
-- Decided requests never appear.
select tests.create_request(:'emp', '2026-10-05', '2026-10-06', 'approved', :'mgr') as r_done \gset
select tests.create_request(:'adm', '2026-10-05', '2026-10-06', 'declined', :'mgr') as r_done2 \gset

create temp table fixture_ids as
select unnest(array[:'r_emp', :'r_mgr', :'r_mgr2', :'r_adm', :'r_adm2', :'r_done', :'r_done2']::uuid[]) as id;
grant select on fixture_ids to authenticated;

select tests.as_authenticated(:'mgr');
select is(
  (select array_agg(id order by id) from public.approval_queue() where id in (select id from fixture_ids)),
  (select array_agg(id order by id) from fixture_ids where id in (:'r_emp', :'r_adm', :'r_adm2')),
  'manager sees pending employee and admin requests, not their own, not another manager''s'
);

select tests.as_authenticated(:'adm');
select is(
  (select array_agg(id order by id) from public.approval_queue() where id in (select id from fixture_ids)),
  (select array_agg(id order by id) from fixture_ids where id in (:'r_emp', :'r_mgr', :'r_mgr2')),
  'admin sees pending employee and manager requests, not their own, not another admin''s'
);

select is(
  (select count(*)::int from public.approval_queue() where id in (:'r_done', :'r_done2')),
  0,
  'decided requests never appear'
);

select tests.as_authenticated(:'emp');
select throws_ok('select * from public.approval_queue()', 'P0001', 'not_allowed', 'employee refused');

select tests.as_authenticated(:'off');
select throws_ok('select * from public.approval_queue()', 'P0001', 'not_allowed', 'inactive manager refused');

select tests.as_authenticated(gen_random_uuid());
select throws_ok('select * from public.approval_queue()', 'P0001', 'not_allowed', 'a user with no profile is refused');

select tests.as_anon();
select throws_ok('select * from public.approval_queue()', '42501', null, 'anon: not executable');

select tests.reset_role();
select has_function('public', 'approval_queue', array[]::text[], 'approval_queue() exists');

-- Deciding removes a request from the queue.
select tests.as_authenticated(:'mgr');
select public.decide_leave_request(:'r_emp', 'approved', null);
select is(
  (select count(*)::int from public.approval_queue() where id = :'r_emp'),
  0,
  'a request leaves the queue once decided'
);

select * from finish();
rollback;
