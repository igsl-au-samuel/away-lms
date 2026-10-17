-- Access matrix row 2: each active user updates only their own region_code and
-- timezone. Other people's rows and an inactive user's own row don't change.
begin;
select plan(8);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

-- Allowed: own row.
select tests.as_authenticated(:'emp');
update public.profiles set region_code = 'NSW', timezone = 'Australia/Sydney' where id = :'emp';
select tests.as_authenticated(:'mgr');
update public.profiles set region_code = 'HK', timezone = 'Asia/Hong_Kong' where id = :'mgr';
select tests.as_authenticated(:'adm');
update public.profiles set region_code = 'NSW', timezone = 'Australia/Sydney' where id = :'adm';

select tests.reset_role();
select is(
  (select region_code || ' ' || timezone from public.profiles where id = :'emp'),
  'NSW Australia/Sydney',
  'employee updates own region and timezone'
);
select is(
  (select region_code || ' ' || timezone from public.profiles where id = :'mgr'),
  'HK Asia/Hong_Kong',
  'manager updates own region and timezone'
);
select is(
  (select region_code || ' ' || timezone from public.profiles where id = :'adm'),
  'NSW Australia/Sydney',
  'admin updates own region and timezone'
);

-- Refused: someone else's row (silently filtered by RLS), even for an admin.
select tests.as_authenticated(:'emp');
update public.profiles set timezone = 'Asia/Tokyo' where id = :'mgr';
select tests.as_authenticated(:'adm');
update public.profiles set timezone = 'Asia/Tokyo' where id = :'emp';

select tests.reset_role();
select is(
  (select timezone from public.profiles where id = :'mgr'),
  'Asia/Hong_Kong',
  'employee cannot update another user''s row'
);
select is(
  (select timezone from public.profiles where id = :'emp'),
  'Australia/Sydney',
  'admin cannot update another user''s row directly'
);

-- Refused: an inactive user's own row.
select tests.as_authenticated(:'off');
update public.profiles set region_code = 'HK', timezone = 'Asia/Hong_Kong' where id = :'off';
select tests.reset_role();
select is(
  (select region_code from public.profiles where id = :'off'),
  'QLD',
  'inactive user cannot update their own row'
);

select tests.as_anon();
select throws_ok(
  format('update public.profiles set timezone = %L where id = %L', 'Asia/Tokyo', :'emp'),
  '42501',
  null,
  'anon cannot update profiles'
);

select tests.as_authenticated(:'emp');
select throws_ok(
  format('update public.profiles set timezone = %L where id = %L', 'Mars/Olympus_Mons', :'emp'),
  '22023',
  null,
  'an invalid timezone is rejected'
);

select * from finish();
rollback;
