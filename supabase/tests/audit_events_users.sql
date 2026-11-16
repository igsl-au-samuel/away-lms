-- FR-031 and SC-001: the people events on every route, plus FR-007 — an entry holds
-- the fields the audit needs and never an email address, because the email lives in
-- auth.users and is not a change anybody has to answer for.
begin;
select plan(15);

select tests.create_user('employee', 'QLD') as emp1 \gset
select tests.create_user('employee', 'QLD') as emp2 \gset
select tests.create_user('employee', 'QLD') as emp3 \gset
select tests.create_user('admin', 'QLD') as adm \gset

-- An auth user with no profile yet, as after inviteUserByEmail.
select gen_random_uuid() as newu \gset
insert into auth.users (id, aud, role, email, instance_id)
values (:'newu', 'authenticated', 'authenticated', 'new.person@test.local',
        '00000000-0000-0000-0000-000000000000');

select tests.as_authenticated(:'adm');
select public.admin_create_profile(:'newu', 'New Person', 'New.Person@Test.Local',
  'employee', 'NSW');
select tests.reset_role();

select is(
  (select count(*)::int from public.audit_log
   where action = 'user_created' and subject_id = :'newu'),
  1,
  'creating a profile writes exactly one entry');
select is(
  (select actor_role::text || '/' || actor_name
   from public.audit_log where action = 'user_created' and subject_id = :'newu'),
  'admin/Test admin',
  'the admin who invited them is the actor');
select is(
  (select after from public.audit_log
   where action = 'user_created' and subject_id = :'newu'),
  jsonb_build_object('role', 'employee', 'region_code', 'NSW', 'is_active', true),
  'the entry holds role, region and active flag — the field list, not the row');
select is(
  (select subject_name from public.audit_log
   where action = 'user_created' and subject_id = :'newu'),
  'New Person',
  'the subject name is snapshotted');

-- One save that moves role and region writes two entries (FR-014).
select tests.as_authenticated(:'adm');
select public.admin_update_user(:'emp2', 'Renamed employee', 'manager', 'HK');
select tests.reset_role();

select is(
  (select count(*)::int from public.audit_log
   where action in ('user_role_changed', 'user_region_changed') and subject_id = :'emp2'),
  2,
  'a save of role and region writes one entry per field');
select is(
  (select string_agg(action, ',' order by action) from public.audit_log
   where action in ('user_role_changed', 'user_region_changed') and subject_id = :'emp2'),
  'user_region_changed,user_role_changed',
  'each entry names one field only');
select is(
  (select (before->>'role') || '>' || (after->>'role') from public.audit_log
   where action = 'user_role_changed' and subject_id = :'emp2'),
  'employee>manager',
  'the role entry holds the old and new role');
select is(
  (select (before->>'region_code') || '>' || (after->>'region_code') from public.audit_log
   where action = 'user_region_changed' and subject_id = :'emp2'),
  'QLD>HK',
  'the region entry holds the old and new region');

-- Saving the same values again is a no-op.
select tests.as_authenticated(:'adm');
select public.admin_update_user(:'emp2', 'Renamed employee', 'manager', 'HK');
select tests.reset_role();
select is(
  (select count(*)::int from public.audit_log
   where action in ('user_role_changed', 'user_region_changed') and subject_id = :'emp2'),
  2,
  'a save that changes nothing writes nothing');

-- The name and the email are not audited at all.
update public.profiles set full_name = 'Silent rename' where id = :'emp2';
update public.profiles set email = 'silent@test.local' where id = :'emp2';
select is(
  (select count(*)::int from public.audit_log
   where action in ('user_role_changed', 'user_region_changed') and subject_id = :'emp2'),
  2,
  'a rename and an email change write nothing');

-- Someone deactivating a person.
select tests.as_authenticated(:'adm');
select public.admin_set_active(:'emp2', false);
select tests.reset_role();
select is(
  (select (before->>'is_active') || '>' || (after->>'is_active') from public.audit_log
   where action = 'user_active_changed' and subject_id = :'emp2'),
  'true>false',
  'admin_set_active writes user_active_changed with the pair');

-- A person changing their own region: they are the actor and the subject.
select tests.as_authenticated(:'emp1');
update public.profiles set region_code = 'HK' where id = (select auth.uid());
select tests.reset_role();
select is(
  (select (actor_id = :'emp1')::text || '/' || (subject_id = :'emp1')::text || '/'
   || actor_role::text || '/' || (before->>'region_code') || '>' || (after->>'region_code')
   from public.audit_log where action = 'user_region_changed' and subject_id = :'emp1'),
  'true/true/employee/QLD>HK',
  'an own region edit is recorded with the user as actor and subject');

-- Direct SQL and the secret key both record System.
update public.profiles set region_code = 'HK' where id = :'emp3';
select is(
  (select actor_name || '/' || coalesce(actor_role::text, '<null>')
   from public.audit_log where action = 'user_region_changed' and subject_id = :'emp3'),
  'System/<null>',
  'a direct update records System');

select tests.as_service();
update public.profiles set is_active = false where id = :'emp3';
select tests.reset_role();
select is(
  (select action || '/' || actor_name from public.audit_log
   where subject_id = :'emp3' and action = 'user_active_changed'),
  'user_active_changed/System',
  'a secret-key write records System too');

select is(
  (select count(*)::int from public.audit_log
   where before ? 'email' or after ? 'email' or context ? 'email'),
  0,
  'no entry anywhere holds an email key (FR-007)');

select * from finish();
rollback;
