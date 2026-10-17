-- US5-2 (FR-026): after a user changes their own region, a new request is counted
-- with the new region and an existing request keeps its stored count. An unknown
-- region or an invalid timezone is rejected.
begin;
select plan(8);

select tests.create_user('employee', 'QLD') as emp \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Region change annual', true, 20) returning id as lt \gset

select tests.as_authenticated(:'emp');

-- The Ekka week in QLD: Wed 12 Aug is a QLD-only holiday, so 4 working days.
select id as before_req from public.submit_leave_request(:'lt', '2026-08-10', '2026-08-14') \gset

update public.profiles set region_code = 'NSW', timezone = 'Australia/Sydney' where id = :'emp';

select is(
  (select region_code || '/' || timezone from public.profiles where id = :'emp'),
  'NSW/Australia/Sydney',
  'the user can change their own region and timezone'
);
select is(
  (select working_days from public.leave_requests where id = :'before_req'),
  4.0::numeric,
  'an existing request keeps its stored working days'
);
select is(
  (select region_code from public.leave_requests where id = :'before_req'),
  'QLD',
  'an existing request keeps its stored region'
);

-- Free the Ekka day (keep the week's other days), then request it as NSW:
-- a normal working day there, counted with the new region.
select tests.reset_role();
update public.leave_requests set end_date = '2026-08-11' where id = :'before_req';
select tests.as_authenticated(:'emp');
select id as ekka_nsw from public.submit_leave_request(:'lt', '2026-08-12', '2026-08-12') \gset

select is(
  (select region_code from public.leave_requests where id = :'ekka_nsw'),
  'NSW',
  'a new request uses the new region'
);
select is(
  (select working_days from public.leave_requests where id = :'ekka_nsw'),
  1.0::numeric,
  'the Ekka is a working day in NSW'
);

select throws_ok(
  format('update public.profiles set region_code = %L where id = %L', 'ZZZ', :'emp'),
  '23503', null, 'an unknown region is rejected'
);
select throws_ok(
  format('update public.profiles set timezone = %L where id = %L', 'Mars/Olympus', :'emp'),
  null, null, 'an invalid timezone is rejected'
);
select is(
  (select region_code from public.profiles where id = :'emp'),
  'NSW',
  'rejected updates leave the profile unchanged'
);

select * from finish();
rollback;
