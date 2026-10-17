-- US1-3 and FR-010: balance arithmetic through get_balances.
begin;
select plan(9);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Bal annual', true, 20) returning id as annual \gset
insert into public.leave_types (name, is_capped, default_allowance)
values ('Bal unpaid', false, null) returning id as unpaid \gset
insert into public.leave_types (name, is_capped, default_allowance, is_active)
values ('Bal retired quiet', true, 5, false) returning id as retired_quiet \gset
insert into public.leave_types (name, is_capped, default_allowance, is_active)
values ('Bal retired used', true, 5, false) returning id as retired_used \gset

-- 20 allowance, 3 approved, 2 pending, one declined (must not count).
select tests.create_request(:'emp', '2026-03-02', '2026-03-04', 'approved', :'mgr', 3, :'annual');
select tests.create_request(:'emp', '2026-04-06', '2026-04-07', 'pending', null, 2, :'annual');
select tests.create_request(:'emp', '2026-05-04', '2026-05-08', 'declined', :'mgr', 5, :'annual');
select tests.create_request(:'emp', '2026-06-01', '2026-06-01', 'approved', :'mgr', 1, :'retired_used');
-- Last year's request does not show in 2026 numbers.
select tests.create_request(:'emp', '2025-11-03', '2025-11-04', 'approved', :'mgr', 2, :'annual');

select tests.as_authenticated(:'emp');

select is(
  (select taken::text || '/' || pending::text || '/' || available::text
   from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'annual'),
  '3.0/2.0/15.0',
  'US1-3: 20 allowance, 3 approved, 2 pending gives available 15, taken 3, pending 2'
);
select is(
  (select allowance from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'annual'),
  20.0::numeric,
  'the default allowance applies with no override'
);
select is(
  (select count(*)::int from public.get_balances(:'emp', 2025::smallint) where leave_type_id = :'annual' and taken = 2),
  1,
  'balances are per year'
);

select tests.reset_role();
insert into public.allowance_overrides (user_id, leave_type_id, year, days) values (:'emp', :'annual', 2026, 30);
select tests.as_authenticated(:'emp');
select is(
  (select allowance::text || '/' || available::text
   from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'annual'),
  '30.0/25.0',
  'an override replaces the default'
);

select is(
  (select allowance is null and available is null and not is_capped
   from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'unpaid'),
  true,
  'an uncapped type returns null allowance and available'
);

select is(
  (select count(*)::int from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'retired_quiet'),
  0,
  'a retired type with no requests that year is hidden'
);
select is(
  (select taken from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'retired_used'),
  1.0::numeric,
  'a retired type with requests that year is shown'
);

select tests.reset_role();
update public.allowance_overrides set days = 4 where user_id = :'emp' and leave_type_id = :'annual';
select tests.as_authenticated(:'emp');
select is(
  (select available from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'annual'),
  -1.0::numeric,
  'available goes negative after an allowance cut'
);

select is(
  (select pending from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'annual'),
  2.0::numeric,
  'declined requests never count'
);

select * from finish();
rollback;
