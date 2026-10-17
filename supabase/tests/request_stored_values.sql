-- Values stored at submission (FR-012, FR-014, US2-3, US2-6): working_days and
-- region_code are fixed when the request is made; over_balance_days records a
-- shortfall for capped types; the pending days come off the available balance.
begin;
select plan(13);

select tests.create_user('employee', 'QLD') as emp \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Stored small', true, 5) returning id as small \gset
insert into public.leave_types (name, is_capped, default_allowance)
values ('Stored unpaid', false, null) returning id as unpaid \gset

select tests.as_authenticated(:'emp');

-- The Ekka week in QLD: 4 working days, within the 5-day allowance.
select id as ekka from public.submit_leave_request(:'small', '2026-08-10', '2026-08-14') \gset

select is(
  (select working_days from public.leave_requests where id = :'ekka'),
  4.0::numeric,
  'working_days is computed and stored'
);
select is(
  (select region_code from public.leave_requests where id = :'ekka'),
  'QLD',
  'region_code is the requester''s region'
);
select is(
  (select over_balance_days from public.leave_requests where id = :'ekka'),
  null::numeric,
  'within balance: over_balance_days is null'
);
select is(
  (select available from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'small'),
  1.0::numeric,
  'available drops by the pending days (5 - 4)'
);
select is(
  (select pending from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'small'),
  4.0::numeric,
  'the request counts as pending'
);

-- Seven more working days (Mon 7 to Tue 15 Sep) against 1 available: 6 over.
select id as ovr from public.submit_leave_request(:'small', '2026-09-07', '2026-09-15') \gset
select is(
  (select working_days::text || '/' || over_balance_days::text from public.leave_requests where id = :'ovr'),
  '7.0/6.0',
  'over balance: over_balance_days is the shortfall'
);
select is(
  (select available from public.get_balances(:'emp', 2026::smallint) where leave_type_id = :'small'),
  -6.0::numeric,
  'available may go negative'
);

select id as unp from public.submit_leave_request(:'unpaid', '2026-10-19', '2026-10-30') \gset
select is(
  (select over_balance_days from public.leave_requests where id = :'unp'),
  null::numeric,
  'uncapped type: over_balance_days is null'
);
select is(
  (select working_days from public.leave_requests where id = :'unp'),
  10.0::numeric,
  'uncapped type still stores working days'
);

-- Later changes do not rewrite stored values.
select tests.reset_role();
update public.public_holidays set holiday_date = '2026-08-13'
where region_code = 'QLD' and holiday_date = '2026-08-12';
select is(
  (select working_days from public.leave_requests where id = :'ekka'),
  4.0::numeric,
  'moving a holiday leaves working_days unchanged'
);
delete from public.public_holidays where region_code = 'QLD' and holiday_date = '2026-08-13';
select is(
  (select working_days from public.leave_requests where id = :'ekka'),
  4.0::numeric,
  'removing a holiday leaves working_days unchanged'
);
select is(
  private.count_working_days('QLD', '2026-08-10', '2026-08-14'),
  5::numeric,
  'while a new count does see the change'
);

update public.profiles set region_code = 'NSW' where id = :'emp';
select is(
  (select region_code || '/' || working_days::text from public.leave_requests where id = :'ekka'),
  'QLD/4.0',
  'changing the user''s region leaves region_code and working_days unchanged'
);

select * from finish();
rollback;
