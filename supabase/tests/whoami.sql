-- whoami(): the caller's profile, or null for inactive / profile-less / anon.
begin;
select plan(10);

select has_function('public', 'whoami', array[]::text[], 'whoami() exists');

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'VIC') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset
select tests.create_user('employee', 'QLD', true, true) as demo \gset

select tests.as_authenticated(:'emp');
select is((public.whoami()->>'id')::uuid, :'emp'::uuid, 'employee: returns own id');
select is(public.whoami()->>'role', 'employee', 'employee: role is employee');

select tests.as_authenticated(:'mgr');
select is(public.whoami()->>'role', 'manager', 'manager: role is manager');
select is(public.whoami()->>'region_code', 'NSW', 'manager: region_code is returned');

select tests.as_authenticated(:'adm');
select is(public.whoami()->>'role', 'admin', 'admin: role is admin');

select tests.as_authenticated(:'demo');
select is((public.whoami()->>'is_demo')::boolean, true, 'demo user: is_demo is true');

select tests.as_authenticated(:'off');
select is(public.whoami(), null, 'inactive user: null');

select tests.as_authenticated('00000000-0000-0000-0000-0000000000bb');
select is(public.whoami(), null, 'authenticated without a profile: null');

select tests.as_anon();
select is(public.whoami(), null, 'anon: null');

select * from finish();
rollback;
