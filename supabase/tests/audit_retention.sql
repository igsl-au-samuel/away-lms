-- FR-012, FR-013 and SC-007: deleting a person, a request or a leave type leaves every
-- entry that refers to them, with the names as they were. The columns have no foreign
-- keys for exactly this reason, and the cascade that deleting a user triggers must not
-- be mistaken for an event (research R3).
begin;
select plan(11);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('A24 annual', true, 20) returning id as lt \gset

select tests.as_authenticated(:'emp');
select id from public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08') \gset r1_
select tests.as_authenticated(:'adm');
select public.admin_set_allowance(:'emp', :'lt', 2026::smallint, 25, 'Long service');
select tests.reset_role();

select id from public.audit_log
  where action = 'request_submitted' and entity_id = :'r1_id' \gset s1_

-- The three entries that refer to the employee: created, submitted, allowance.
select is(
  (select count(*)::int from public.audit_log where subject_id = :'emp'),
  3,
  'three entries refer to the employee before the deletion');
select is(
  (select count(*)::int from public.audit_log where entity_id = :'r1_id'),
  1,
  'one entry refers to their request');

-- Rename the person and the type, then check the older entries did not move.
update public.profiles set full_name = 'Renamed later' where id = :'emp';
update public.leave_types set name = 'Renamed type' where id = :'lt';

select is(
  (select actor_name || '/' || subject_name from public.audit_log where id = :'s1_id'),
  'Test employee/Test employee',
  'the submission entry keeps the names as they were at the time (FR-012)');
select is(
  (select (context->>'leave_type_name') from public.audit_log where id = :'s1_id'),
  'A24 annual',
  'the type name in the context is the one at the time, not the new one');

-- Deleting the auth user cascades the profile, the request and the override.
delete from public.allowance_overrides
where user_id = :'emp' and leave_type_id = :'lt' and year = 2026;
select is(
  (select count(*)::int from public.audit_log
   where action = 'allowance_removed' and subject_id = :'emp'),
  1,
  'removing an override while the profile exists is an event and is logged');

delete from auth.users where id = :'emp';
select is(
  (select count(*)::int from public.audit_log where subject_id = :'emp'),
  4,
  'the person is gone but every entry about them is still there');
select is(
  (select count(*)::int from public.audit_log
   where action = 'allowance_removed' and subject_id = :'emp'),
  1,
  'the cascaded override removal wrote no further entry (R3)');
select is(
  (select count(*)::int from public.audit_log where entity_id = :'r1_id'),
  1,
  'the cascaded request keeps its entry, with no row left to point at');
select is(
  (select exists(select 1 from public.profiles where id = :'emp')::text || '/'
   || exists(select 1 from public.leave_requests where id = :'r1_id')::text),
  'false/false',
  'the profile and the request really are gone');

delete from public.leave_types where id = :'lt';
select is(
  (select count(*)::int from public.audit_log where entity_id = :'lt'),
  1,
  'deleting the leave type leaves its entries, id and all');

-- The order the reads promise: newest first, with the id breaking ties so two entries
-- written in the same instant never swap between pages.
select private.audit_write('user_created', 'user', null, :'adm', null,
  jsonb_build_object('role', 'admin'), null, null, timestamptz '2026-01-01 00:00:00+00');
select private.audit_write('user_created', 'user', null, :'mgr', null,
  jsonb_build_object('role', 'manager'), null, null, timestamptz '2026-01-01 00:00:00+00');
select is(
  (select array_agg(id) from (
     select id from public.audit_log
     where created_at = timestamptz '2026-01-01 00:00:00+00'
     order by created_at desc, id desc) tied),
  (select array_agg(id) from (
     select id from public.audit_log
     where created_at = timestamptz '2026-01-01 00:00:00+00'
     order by id desc) latest),
  'entries sharing a timestamp come out with the higher id first');

select * from finish();
rollback;
