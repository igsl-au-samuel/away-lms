-- Access matrix row 5: admin_set_demo_active. Admin only; flips is_active on
-- demo profiles, returns their ids, and never touches a real profile.
begin;
select plan(11);

select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'NSW') as mgr \gset
select tests.create_user('admin', 'QLD', false) as off \gset
select tests.create_user('employee', 'HK', false) as offemp \gset
select tests.create_user('employee', 'QLD', true, true) as demo1 \gset
select tests.create_user('employee', 'NSW', true, true) as demo2 \gset

select array_agg(id order by id)::text as demo_ids
from public.profiles where id in (:'demo1', :'demo2') \gset
select md5(string_agg(p::text, '|' order by p.id)) as real_before
from public.profiles p where not p.is_demo \gset

select tests.as_authenticated(:'adm');
select is(public.admin_set_demo_active(false)::text, :'demo_ids', 'admin disables demo users and gets their ids back');

select tests.reset_role();
select is(
  (select count(*)::int from public.profiles where is_demo and is_active),
  0,
  'every demo profile is inactive'
);
select is(
  (select md5(string_agg(p::text, '|' order by p.id)) from public.profiles p where not p.is_demo),
  :'real_before',
  'real profiles are untouched after disabling'
);

select tests.as_authenticated(:'adm');
select is(public.admin_set_demo_active(true)::text, :'demo_ids', 'admin re-enables demo users and gets their ids back');

select tests.reset_role();
select is(
  (select count(*)::int from public.profiles where is_demo and is_active),
  2,
  'every demo profile is active again'
);
select is(
  (select md5(string_agg(p::text, '|' order by p.id)) from public.profiles p where not p.is_demo),
  :'real_before',
  'real profiles are untouched after enabling (an inactive real user stays inactive)'
);

-- Refused.
select tests.as_authenticated(:'emp');
select throws_ok('select public.admin_set_demo_active(false)', 'P0001', 'not_allowed', 'employee refused');
select tests.as_authenticated(:'mgr');
select throws_ok('select public.admin_set_demo_active(false)', 'P0001', 'not_allowed', 'manager refused');
select tests.as_authenticated(:'off');
select throws_ok('select public.admin_set_demo_active(false)', 'P0001', 'not_allowed', 'inactive admin refused');
select tests.as_authenticated(:'demo1');
select throws_ok('select public.admin_set_demo_active(false)', 'P0001', 'not_allowed', 'demo employee refused');
select tests.as_anon();
select throws_ok('select public.admin_set_demo_active(false)', '42501', null, 'anon: not executable');

select * from finish();
rollback;
