-- Access matrix row 6: leave_types select. Active users see every type
-- (including retired ones, for old requests); inactive users and anon see none.
begin;
select plan(6);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('admin', 'QLD', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance, is_active)
values ('Retired leave', false, null, false);
select count(*)::int as total from public.leave_types \gset

select tests.as_authenticated(:'emp');
select is((select count(*)::int from public.leave_types), :total, 'employee sees every leave type');

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.leave_types), :total, 'manager sees every leave type');

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.leave_types), :total, 'admin sees every leave type');

select tests.as_authenticated(:'off');
select is((select count(*)::int from public.leave_types), 0, 'inactive admin sees no leave types');

select tests.as_anon();
select is((select count(*)::int from public.leave_types), 0, 'anon sees no leave types');

select tests.reset_role();
select ok(:total >= 4, 'the seeded types plus the retired one exist');

select * from finish();
rollback;
