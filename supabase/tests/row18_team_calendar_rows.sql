-- Access matrix row 18: team_calendar rows. Any active user (employee, manager,
-- admin) gets the pending and approved rows in range; inactive users, users with
-- no profile and anon are refused. A range over 62 days, or an inverted one, raises
-- invalid_range (FR-024).
begin;
select plan(11);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

select tests.create_request(:'emp', '2026-09-07', '2026-09-08') as r_emp \gset
select tests.create_request(:'mgr', '2026-09-09', '2026-09-09', 'approved', :'adm') as r_mgr \gset
select tests.create_request(:'adm', '2026-09-10', '2026-09-11') as r_adm \gset

create temp table fixture_ids as
select unnest(array[:'r_emp', :'r_mgr', :'r_adm']::uuid[]) as id;
grant select on fixture_ids to authenticated;

select tests.as_authenticated(:'emp');
select is(
  (select array_agg(request_id order by request_id)
   from public.team_calendar('2026-09-01', '2026-09-30') where request_id in (select id from fixture_ids)),
  (select array_agg(id order by id) from fixture_ids),
  'employee sees every pending and approved row in range'
);

select tests.as_authenticated(:'mgr');
select is(
  (select count(*)::int from public.team_calendar('2026-09-01', '2026-09-30') where request_id in (select id from fixture_ids)),
  3,
  'manager sees every row in range'
);

select tests.as_authenticated(:'adm');
select is(
  (select count(*)::int from public.team_calendar('2026-09-01', '2026-09-30') where request_id in (select id from fixture_ids)),
  3,
  'admin sees every row in range'
);

-- Exactly 62 days is allowed; 63 is not.
select lives_ok(
  $$select * from public.team_calendar('2026-09-01', '2026-11-01')$$,
  'a 62-day range is allowed'
);
select throws_ok(
  $$select * from public.team_calendar('2026-09-01', '2026-11-02')$$,
  'P0001', 'invalid_range', 'a 63-day range raises invalid_range'
);
select throws_ok(
  $$select * from public.team_calendar('2026-09-30', '2026-09-01')$$,
  'P0001', 'invalid_range', 'an inverted range raises invalid_range'
);
select throws_ok(
  $$select * from public.team_calendar(null, '2026-09-30')$$,
  'P0001', 'invalid_range', 'a missing bound raises invalid_range'
);

select tests.as_authenticated(:'off');
select throws_ok(
  $$select * from public.team_calendar('2026-09-01', '2026-09-30')$$,
  'P0001', 'not_allowed', 'an inactive user is refused'
);

select tests.as_authenticated(gen_random_uuid());
select throws_ok(
  $$select * from public.team_calendar('2026-09-01', '2026-09-30')$$,
  'P0001', 'not_allowed', 'a user with no profile is refused'
);

select tests.as_anon();
select throws_ok(
  $$select * from public.team_calendar('2026-09-01', '2026-09-30')$$,
  '42501', null, 'anon: not executable'
);

select tests.reset_role();
select has_function('public', 'team_calendar', array['date', 'date'], 'team_calendar(date, date) exists');

select * from finish();
rollback;
