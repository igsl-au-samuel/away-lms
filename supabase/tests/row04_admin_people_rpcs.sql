-- Access matrix row 4: admin_create_profile, admin_update_user, admin_set_active.
-- Admin only; an admin can't change their own role or deactivate themselves.
begin;
select plan(21);

select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD', false) as off \gset
select tests.create_user('employee', 'QLD') as tgt \gset

-- Auth users with no profile yet (as after inviteUserByEmail).
select gen_random_uuid() as newu \gset
select gen_random_uuid() as newu2 \gset
insert into auth.users (id, aud, role, email, instance_id) values
  (:'newu', 'authenticated', 'authenticated', 'new.person@test.local', '00000000-0000-0000-0000-000000000000'),
  (:'newu2', 'authenticated', 'authenticated', 'other.person@test.local', '00000000-0000-0000-0000-000000000000');

-- Allowed: admin.
select tests.as_authenticated(:'adm');

select is(
  (select role::text || ' ' || email || ' ' || region_code || ' ' || timezone || ' ' || is_active::text
   from public.admin_create_profile(:'newu', 'New Person', 'New.Person@Test.Local', 'employee', 'NSW')),
  'employee new.person@test.local NSW Australia/Sydney true',
  'admin creates a profile: email lower-cased, timezone from the region'
);
select throws_ok(
  format('select public.admin_create_profile(%L, %L, %L, %L, %L)', :'tgt', 'Again', 'again@test.local', 'employee', 'QLD'),
  'P0001', 'profile_exists', 'admin_create_profile: profile_exists when the user already has one'
);
select throws_ok(
  format('select public.admin_create_profile(%L, %L, %L, %L, %L)', gen_random_uuid(), 'Ghost', 'ghost@test.local', 'employee', 'QLD'),
  'P0001', 'not_found', 'admin_create_profile: not_found when there is no auth user'
);

select is(
  (select full_name || ' ' || role::text || ' ' || region_code
   from public.admin_update_user(:'tgt', 'Target Renamed', 'manager', 'HK')),
  'Target Renamed manager HK',
  'admin updates another user''s name, role and region'
);
select lives_ok(
  format('select public.admin_update_user(%L, %L, %L, %L)', :'adm', 'Admin Renamed', 'admin', 'QLD'),
  'admin can update their own name when the role stays the same'
);
select throws_ok(
  format('select public.admin_update_user(%L, %L, %L, %L)', :'adm', 'Admin', 'manager', 'QLD'),
  'P0001', 'cannot_change_own_role', 'admin cannot change their own role'
);
select throws_ok(
  format('select public.admin_update_user(%L, %L, %L, %L)', gen_random_uuid(), 'Ghost', 'employee', 'QLD'),
  'P0001', 'not_found', 'admin_update_user: not_found for an unknown user'
);

select is(
  (select is_active from public.admin_set_active(:'tgt', false)),
  false,
  'admin deactivates another user'
);
select throws_ok(
  format('select public.admin_set_active(%L, %L)', :'adm', false),
  'P0001', 'cannot_deactivate_self', 'admin cannot deactivate themselves'
);

-- Refused: employee, manager, inactive admin.
select tests.as_authenticated(:'emp');
select throws_ok(
  format('select public.admin_create_profile(%L, %L, %L, %L, %L)', :'newu2', 'Other', 'other.person@test.local', 'admin', 'QLD'),
  'P0001', 'not_allowed', 'employee: admin_create_profile refused'
);
select throws_ok(
  format('select public.admin_update_user(%L, %L, %L, %L)', :'emp', 'Me', 'admin', 'QLD'),
  'P0001', 'not_allowed', 'employee: admin_update_user refused'
);
select throws_ok(
  format('select public.admin_set_active(%L, %L)', :'tgt', true),
  'P0001', 'not_allowed', 'employee: admin_set_active refused'
);

select tests.as_authenticated(:'mgr');
select throws_ok(
  format('select public.admin_create_profile(%L, %L, %L, %L, %L)', :'newu2', 'Other', 'other.person@test.local', 'admin', 'QLD'),
  'P0001', 'not_allowed', 'manager: admin_create_profile refused'
);
select throws_ok(
  format('select public.admin_update_user(%L, %L, %L, %L)', :'emp', 'Promoted', 'manager', 'QLD'),
  'P0001', 'not_allowed', 'manager: admin_update_user refused'
);
select throws_ok(
  format('select public.admin_set_active(%L, %L)', :'emp', false),
  'P0001', 'not_allowed', 'manager: admin_set_active refused'
);

select tests.as_authenticated(:'off');
select throws_ok(
  format('select public.admin_create_profile(%L, %L, %L, %L, %L)', :'newu2', 'Other', 'other.person@test.local', 'admin', 'QLD'),
  'P0001', 'not_allowed', 'inactive admin: admin_create_profile refused'
);
select throws_ok(
  format('select public.admin_update_user(%L, %L, %L, %L)', :'emp', 'Demoted', 'employee', 'QLD'),
  'P0001', 'not_allowed', 'inactive admin: admin_update_user refused'
);
select throws_ok(
  format('select public.admin_set_active(%L, %L)', :'off', true),
  'P0001', 'not_allowed', 'inactive admin: cannot reactivate themselves'
);

-- Refused: anon has no execute grant at all.
select tests.as_anon();
select throws_ok(
  format('select public.admin_create_profile(%L, %L, %L, %L, %L)', :'newu2', 'Other', 'other.person@test.local', 'admin', 'QLD'),
  '42501', null, 'anon: admin_create_profile not executable'
);
select throws_ok(
  format('select public.admin_update_user(%L, %L, %L, %L)', :'emp', 'Anon', 'admin', 'QLD'),
  '42501', null, 'anon: admin_update_user not executable'
);
select throws_ok(
  format('select public.admin_set_active(%L, %L)', :'emp', false),
  '42501', null, 'anon: admin_set_active not executable'
);

select * from finish();
rollback;
