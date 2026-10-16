-- Access matrix row 9: holiday_regions and public_holidays writes are admin only.
-- Regions are never deleted (no grant, and FK restrict while in use).
begin;
select plan(23);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('admin', 'QLD', false) as off \gset

select id as hol, name as hol_name from public.public_holidays
where region_code = 'QLD' order by holiday_date limit 1 \gset

-- Allowed: admin.
select tests.as_authenticated(:'adm');
select lives_ok(
  $$insert into public.holiday_regions (code, name, default_timezone) values ('TAS', 'Tasmania', 'Australia/Hobart')$$,
  'admin inserts a region'
);
update public.holiday_regions set name = 'Tasmania (Hobart)' where code = 'TAS';
select lives_ok(
  $$insert into public.public_holidays (region_code, holiday_date, name) values ('TAS', '2026-02-09', 'Royal Hobart Regatta')$$,
  'admin inserts a holiday'
);
update public.public_holidays set name = 'Regatta Day' where region_code = 'TAS';

select tests.reset_role();
select is((select name from public.holiday_regions where code = 'TAS'), 'Tasmania (Hobart)', 'admin updates a region');
select is((select name from public.public_holidays where region_code = 'TAS'), 'Regatta Day', 'admin updates a holiday');

select tests.as_authenticated(:'adm');
delete from public.public_holidays where region_code = 'TAS';
select tests.reset_role();
select is((select count(*)::int from public.public_holidays where region_code = 'TAS'), 0, 'admin deletes a holiday');

select tests.as_authenticated(:'adm');
select throws_ok(
  $$delete from public.holiday_regions where code = 'TAS'$$,
  '42501', null, 'admin cannot delete a region, even an unused one'
);

-- Refused: employee, manager, inactive admin.
select tests.as_authenticated(:'emp');
select throws_ok(
  $$insert into public.public_holidays (region_code, holiday_date, name) values ('QLD', '2026-12-30', 'Emp day')$$,
  '42501', null, 'employee cannot insert a holiday'
);
select throws_ok(
  $$insert into public.holiday_regions (code, name, default_timezone) values ('WA', 'Perth', 'Australia/Perth')$$,
  '42501', null, 'employee cannot insert a region'
);
update public.public_holidays set name = 'Emp renamed' where id = :'hol';
update public.holiday_regions set name = 'Emp renamed' where code = 'QLD';
delete from public.public_holidays where id = :'hol';
select tests.reset_role();
select is((select name from public.public_holidays where id = :'hol'), :'hol_name', 'employee cannot update or delete a holiday');
select is((select name from public.holiday_regions where code = 'QLD'), 'Queensland (Brisbane)', 'employee cannot update a region');

select tests.as_authenticated(:'mgr');
select throws_ok(
  $$insert into public.public_holidays (region_code, holiday_date, name) values ('QLD', '2026-12-30', 'Mgr day')$$,
  '42501', null, 'manager cannot insert a holiday'
);
update public.public_holidays set name = 'Mgr renamed' where id = :'hol';
select tests.reset_role();
select is((select name from public.public_holidays where id = :'hol'), :'hol_name', 'manager cannot update a holiday');
select tests.as_authenticated(:'mgr');
delete from public.public_holidays where id = :'hol';
select tests.reset_role();
select is((select count(*)::int from public.public_holidays where id = :'hol'), 1, 'manager cannot delete a holiday');

select tests.as_authenticated(:'off');
select throws_ok(
  $$insert into public.public_holidays (region_code, holiday_date, name) values ('QLD', '2026-12-30', 'Off day')$$,
  '42501', null, 'inactive admin cannot insert a holiday'
);
update public.public_holidays set name = 'Off renamed' where id = :'hol';
select tests.reset_role();
select is((select name from public.public_holidays where id = :'hol'), :'hol_name', 'inactive admin cannot update a holiday');
select tests.as_authenticated(:'off');
delete from public.public_holidays where id = :'hol';
select tests.reset_role();
select is((select count(*)::int from public.public_holidays where id = :'hol'), 1, 'inactive admin cannot delete a holiday');

-- Refused: anon has no write grants.
select tests.as_anon();
select throws_ok(
  $$insert into public.public_holidays (region_code, holiday_date, name) values ('QLD', '2026-12-30', 'Anon day')$$,
  '42501', null, 'anon cannot insert a holiday'
);
select throws_ok(
  format('update public.public_holidays set name = %L where id = %L', 'Anon renamed', :'hol'),
  '42501', null, 'anon cannot update a holiday'
);
select throws_ok(
  format('delete from public.public_holidays where id = %L', :'hol'),
  '42501', null, 'anon cannot delete a holiday'
);
select throws_ok(
  $$insert into public.holiday_regions (code, name, default_timezone) values ('WA', 'Perth', 'Australia/Perth')$$,
  '42501', null, 'anon cannot insert a region'
);

-- A region in use can't be deleted by anyone, even the superuser.
select tests.reset_role();
select throws_ok(
  $$delete from public.holiday_regions where code = 'QLD'$$,
  '23503', null, 'deleting a region in use is refused (restrict)'
);

-- TRUNCATE skips RLS, so authenticated must not hold it. Runs last: if it
-- succeeds it empties the table for the rest of this transaction.
select tests.as_authenticated(:'emp');
select throws_ok(
  'truncate public.public_holidays',
  '42501', null, 'employee cannot truncate holidays'
);
select tests.as_authenticated(:'adm');
select throws_ok(
  'truncate public.public_holidays',
  '42501', null, 'admin cannot truncate holidays'
);

select * from finish();
rollback;
