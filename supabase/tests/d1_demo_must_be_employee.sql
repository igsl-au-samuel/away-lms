-- Access matrix D1 (FR-032): a demo profile is always an employee. Promoting one
-- fails by direct update (the table check) and through admin_update_user
-- (demo_must_be_employee). A demo user can still be renamed or moved region.
begin;
select plan(7);

select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', true, true) as demo \gset
select tests.create_user('employee', 'QLD') as emp \gset
-- Makes sure the NSW region exists without relying on seed data.
select tests.create_user('employee', 'NSW') as nsw_user \gset

-- Allowed: the admin edits a demo user's name and region, keeping the employee role.
select tests.as_authenticated(:'adm');
select lives_ok(
  format($$select public.admin_update_user(%L, 'Demo Renamed', 'employee', 'NSW')$$, :'demo'),
  'admin renames and moves a demo employee'
);
-- Allowed: a real employee can be promoted.
select lives_ok(
  format($$select public.admin_update_user(%L, 'Real Person', 'manager', 'QLD')$$, :'emp'),
  'admin promotes a real employee'
);

-- Refused through the RPC.
select throws_ok(
  format($$select public.admin_update_user(%L, 'Demo', 'manager', 'QLD')$$, :'demo'),
  'P0001', 'demo_must_be_employee', 'admin_update_user refuses a demo manager'
);
select throws_ok(
  format($$select public.admin_update_user(%L, 'Demo', 'admin', 'QLD')$$, :'demo'),
  'P0001', 'demo_must_be_employee', 'admin_update_user refuses a demo admin'
);

-- Refused by direct update, even for the superuser (the table check).
select tests.reset_role();
select throws_ok(
  format($$update public.profiles set role = 'manager' where id = %L$$, :'demo'),
  '23514', null, 'direct update to a demo manager violates the check'
);
select throws_ok(
  format($$update public.profiles set role = 'admin' where id = %L$$, :'demo'),
  '23514', null, 'direct update to a demo admin violates the check'
);

select is(
  (select role::text || ' ' || full_name || ' ' || region_code from public.profiles where id = :'demo'),
  'employee Demo Renamed NSW',
  'the demo user is still an employee'
);

select * from finish();
rollback;
