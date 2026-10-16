-- Access matrix row 1: profiles select. Every active user sees every profile
-- (the calendar lists people with no leave); inactive users and anon see none.
begin;
select plan(6);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset
select tests.create_user('employee', 'QLD', true, true) as demo \gset
select tests.create_user('admin', 'QLD', false) as off \gset

select count(*)::int as total from public.profiles \gset

select tests.as_authenticated(:'emp');
select is((select count(*)::int from public.profiles), :total, 'employee sees every profile');

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.profiles), :total, 'manager sees every profile');

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.profiles), :total, 'admin sees every profile');

select tests.as_authenticated(:'demo');
select is((select count(*)::int from public.profiles), :total, 'demo employee sees every profile');

select tests.as_authenticated(:'off');
select is((select count(*)::int from public.profiles), 0, 'inactive admin sees no profiles, not even their own');

select tests.as_anon();
select is((select count(*)::int from public.profiles), 0, 'anon sees no profiles');

select * from finish();
rollback;
