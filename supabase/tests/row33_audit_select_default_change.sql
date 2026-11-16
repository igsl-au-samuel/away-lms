-- Access matrix row 33: `leave_type_default_changed` is the one entry every active
-- role may read, because the default allowance is what a balance is worked out from.
-- An inactive user reads nothing and anon has no grant. Made by a direct update, so
-- this is also the SQL route's System actor case.
begin;
select plan(8);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row33 annual', true, 20) returning id as lt \gset

-- Direct SQL, no caller in the session: the owner session the demo loader and a
-- migration run in.
update public.leave_types set default_allowance = 22.0 where id = :'lt';

select id from public.audit_log
  where action = 'leave_type_default_changed' and entity_id = :'lt' \gset e_

select is((select count(*)::int from public.audit_log where id = :'e_id'), 1,
  'the update wrote one default-change entry');
select is(
  (select subject_id is null from public.audit_log where id = :'e_id'),
  true,
  'a default change belongs to the type, not to a person');
select is((select actor_name from public.audit_log where id = :'e_id'), 'System',
  'with no signed-in user the actor is System');

select tests.as_authenticated(:'emp');
select is((select count(*)::int from public.audit_log where id = :'e_id'), 1,
  'employee sees the default change');
select tests.reset_role();

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.audit_log where id = :'e_id'), 1,
  'manager sees the default change');
select tests.reset_role();

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.audit_log where id = :'e_id'), 1,
  'admin sees the default change');
select tests.reset_role();

select tests.as_authenticated(:'off');
select is((select count(*)::int from public.audit_log), 0,
  'an inactive user sees no entries at all');

select tests.as_anon();
select throws_ok($t$ select count(*) from public.audit_log $t$, '42501', null,
  'anon has no select grant');

select * from finish();
rollback;
