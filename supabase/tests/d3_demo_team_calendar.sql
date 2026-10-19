-- Access matrix D3 (ADR 0004): a demo employee calling team_calendar sees real
-- and demo rows like any employee, with leave_type_name null for other people.
begin;
select plan(4);

select tests.create_user('employee', 'QLD', true, true) as demo \gset
select tests.create_user('employee', 'HK', true, true) as demo2 \gset
select tests.create_user('employee', 'NSW') as real \gset

select tests.create_request(:'demo', '2026-09-07', '2026-09-08') as r_demo \gset
select tests.create_request(:'demo2', '2026-09-09', '2026-09-09') as r_demo2 \gset
select tests.create_request(:'real', '2026-09-10', '2026-09-10') as r_real \gset

select tests.as_authenticated(:'demo');
select is(
  (select count(*)::int from public.team_calendar('2026-09-01', '2026-09-30')
   where request_id in (:'r_demo', :'r_demo2', :'r_real')),
  3,
  'a demo employee gets real and demo rows'
);
select is(
  (select count(*)::int from public.team_calendar('2026-09-01', '2026-09-30')
   where request_id in (:'r_demo2', :'r_real') and leave_type_name is null),
  2,
  'leave_type_name is null for other people''s leave'
);
select isnt(
  (select leave_type_name from public.team_calendar('2026-09-01', '2026-09-30')
   where request_id = :'r_demo'),
  null,
  'leave_type_name is filled for the demo employee''s own leave'
);
select is(
  (select is_demo from public.team_calendar('2026-09-01', '2026-09-30')
   where request_id = :'r_real'),
  false,
  'the real colleague''s row is not flagged demo'
);

select * from finish();
rollback;
