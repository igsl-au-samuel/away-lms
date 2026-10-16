-- Access matrix row 8: holiday_regions and public_holidays are readable by
-- active users; inactive users and anon see none.
begin;
select plan(10);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset
select tests.create_user('admin', 'QLD', false) as off \gset

select count(*)::int as regions from public.holiday_regions \gset
select count(*)::int as holidays from public.public_holidays \gset

select tests.as_authenticated(:'emp');
select is((select count(*)::int from public.holiday_regions), :regions, 'employee sees every region');
select is((select count(*)::int from public.public_holidays), :holidays, 'employee sees every holiday');

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.holiday_regions), :regions, 'manager sees every region');
select is((select count(*)::int from public.public_holidays), :holidays, 'manager sees every holiday');

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.holiday_regions), :regions, 'admin sees every region');
select is((select count(*)::int from public.public_holidays), :holidays, 'admin sees every holiday');

select tests.as_authenticated(:'off');
select is((select count(*)::int from public.holiday_regions), 0, 'inactive admin sees no regions');
select is((select count(*)::int from public.public_holidays), 0, 'inactive admin sees no holidays');

select tests.as_anon();
select is((select count(*)::int from public.holiday_regions), 0, 'anon sees no regions');
select is((select count(*)::int from public.public_holidays), 0, 'anon sees no holidays');

select * from finish();
rollback;
