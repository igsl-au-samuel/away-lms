-- Access matrix row 19 (and D3): team_calendar leave_type_name is null for an
-- employee looking at someone else's leave and filled for the requester, a manager
-- or an admin. Notes and decision comments are never part of the result (FR-024a).
begin;
select plan(9);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'NSW') as emp2 \gset
select tests.create_user('employee', 'QLD', true, true) as demo \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset

select tests.create_request(:'emp', '2026-09-07', '2026-09-08') as r_emp \gset
select tests.create_request(:'emp2', '2026-09-09', '2026-09-09') as r_emp2 \gset
select tests.create_request(:'demo', '2026-09-10', '2026-09-10') as r_demo \gset

-- A note and a decision comment that must never leak.
update public.leave_requests set note = 'secret note' where id = :'r_emp';
update public.leave_requests set note = 'demo note' where id = :'r_demo';

create temp table fixture_ids as
select unnest(array[:'r_emp', :'r_emp2', :'r_demo']::uuid[]) as id;
grant select on fixture_ids to authenticated;

select tests.as_authenticated(:'emp');
select is(
  (select count(*)::int from public.team_calendar('2026-09-01', '2026-09-30')
   where request_id in (:'r_emp2', :'r_demo') and leave_type_name is null),
  2,
  'employee: leave_type_name is null for other people''s leave'
);
select isnt(
  (select leave_type_name from public.team_calendar('2026-09-01', '2026-09-30') where request_id = :'r_emp'),
  null,
  'employee: leave_type_name is filled for their own leave'
);

select tests.as_authenticated(:'mgr');
select is(
  (select count(*)::int from public.team_calendar('2026-09-01', '2026-09-30')
   where request_id in (select id from fixture_ids) and leave_type_name is not null),
  3,
  'manager sees leave_type_name on every row'
);

select tests.as_authenticated(:'adm');
select is(
  (select count(*)::int from public.team_calendar('2026-09-01', '2026-09-30')
   where request_id in (select id from fixture_ids) and leave_type_name is not null),
  3,
  'admin sees leave_type_name on every row'
);

-- D3: a demo employee sees real and demo rows, with the type hidden for others.
select tests.as_authenticated(:'demo');
select is(
  (select count(*)::int from public.team_calendar('2026-09-01', '2026-09-30') where request_id in (:'r_emp', :'r_emp2')),
  2,
  'D3: a demo employee sees real colleagues'' rows'
);
select is(
  (select count(*)::int from public.team_calendar('2026-09-01', '2026-09-30')
   where request_id in (:'r_emp', :'r_emp2') and leave_type_name is null),
  2,
  'D3: leave_type_name is null for others'
);
select isnt(
  (select leave_type_name from public.team_calendar('2026-09-01', '2026-09-30') where request_id = :'r_demo'),
  null,
  'D3: the demo employee sees their own leave type'
);

-- No note or comment columns in the result, and the note text is nowhere in it.
select tests.reset_role();
select is(
  (select array_agg(a.attname order by a.attnum)
   from pg_proc p
   cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, attnum)
   where p.pronamespace = 'public'::regnamespace and p.proname = 'team_calendar' and a.mode = 't'),
  array['request_id', 'user_id', 'full_name', 'region_code', 'is_demo', 'is_active',
        'start_date', 'end_date', 'status', 'leave_type_name'],
  'the result has no note or decision_comment column'
);

select tests.as_authenticated(:'emp2');
select is(
  (select count(*)::int from public.team_calendar('2026-09-01', '2026-09-30') t
   where t::text like '%secret note%' or t::text like '%demo note%'),
  0,
  'note text never appears in any returned row'
);

select * from finish();
rollback;
