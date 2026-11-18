-- FR-031 and SC-001: the allowance events on every route. Slice 1 wrote the audit entry and
-- the old allowance_changes row side by side; A039 removed the second half and A046 dropped the
-- table, so what is left below is the entry — which is the record now, and was the point.
--
-- The reason now reaches the audit entry: admin_set_allowance has set `away.audit_reason`
-- since migration A4. The last two cases drive that setting directly, which is the route a
-- migration or a secret-key write takes, and prove that an empty reason after a non-empty one
-- in the same transaction does not inherit it (R2).
begin;
select plan(13);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('A21 annual', true, 20) returning id as lt \gset

select tests.as_authenticated(:'adm');
select public.admin_set_allowance(:'emp', :'lt', 2026::smallint, 25, 'Long service');
select tests.reset_role();

select is(
  (select count(*)::int from public.audit_log
   where action = 'allowance_set' and subject_id = :'emp'),
  1,
  'setting an override writes exactly one entry'
);
select is(
  (select 'before=' || (before->>'days') || ' after=' || (after->>'days')
   from public.audit_log where action = 'allowance_set' and subject_id = :'emp'),
  'before=20.0 after=25.0',
  'with no prior override the old value is the type default');
select is(
  (select (context->>'leave_type_name') || '/' || (context->>'year')
   || '/' || (context->>'default_days')
   from public.audit_log where action = 'allowance_set' and subject_id = :'emp'),
  'A21 annual/2026/20.0',
  'context names the type, the year and the default the old value came from');
select is(
  (select entity || '/' || (entity_id is null)::text
   from public.audit_log where action = 'allowance_set' and subject_id = :'emp'),
  'allowance/true',
  'an override has no row id of its own, so entity_id stays null');
select is(
  (select actor_role::text || '/' || actor_name
   from public.audit_log where action = 'allowance_set' and subject_id = :'emp'),
  'admin/Test admin',
  'the admin is the actor and the employee the subject');
select is(
  (select comment from public.audit_log
   where action = 'allowance_set' and subject_id = :'emp'),
  'Long service',
  'FR-031: the reason argument reaches the entry as its comment');

-- The update path takes the prior override as its old value.
select tests.as_authenticated(:'adm');
select public.admin_set_allowance(:'emp', :'lt', 2026::smallint, 28, 'More');
select is(
  (select count(*)::int from public.audit_log
   where action = 'allowance_set' and subject_id = :'emp'),
  2,
  'the second save wrote a second entry');
select is(
  (select (before->>'days') from public.audit_log
   where action = 'allowance_set' and subject_id = :'emp' and (after->>'days') = '28.0'),
  '25.0',
  'the update path reads the prior override, not the default');
select public.admin_set_allowance(:'emp', :'lt', 2026::smallint, 28, 'Same again');
select tests.reset_role();
select is(
  (select count(*)::int from public.audit_log
   where action = 'allowance_set' and subject_id = :'emp'),
  2,
  'saving the same number again writes no entry');

-- Direct SQL removal, as the owner session a migration runs in.
delete from public.allowance_overrides
where user_id = :'emp' and leave_type_id = :'lt' and year = 2026;
select is(
  (select (after ? 'days')::text || '/' || coalesce(after->>'days', '<null>')
   || '/' || (before->>'days') || '/' || (context->>'default_days')
   from public.audit_log where action = 'allowance_removed' and subject_id = :'emp'),
  'true/<null>/28.0/20.0',
  'the removal keeps the days key with a null value, the old days and the default');

-- The secret key route.
select tests.as_service();
insert into public.allowance_overrides (user_id, leave_type_id, year, days)
values (:'emp', :'lt', 2027, 15);
select tests.reset_role();
select is(
  (select actor_name || '/' || coalesce(actor_id::text, '<null>')
   || '/' || coalesce(actor_role::text, '<null>')
   from public.audit_log
   where action = 'allowance_set' and subject_id = :'emp' and (context->>'year') = '2027'),
  'System/<null>/<null>',
  'a secret-key write records System with no actor id or role');

-- The same setting driven directly, which is the route a migration or a secret-key write
-- takes now that admin_set_allowance only sets it for its own transaction (research R2).
select set_config('away.audit_reason', 'Manual fix', true);
insert into public.allowance_overrides (user_id, leave_type_id, year, days)
values (:'mgr', :'lt', 2026, 12);
select is(
  (select comment from public.audit_log
   where action = 'allowance_set' and subject_id = :'mgr'),
  'Manual fix',
  'a reason in the transaction setting appears as the entry comment');

select set_config('away.audit_reason', '', true);
delete from public.allowance_overrides
where user_id = :'mgr' and leave_type_id = :'lt' and year = 2026;
select is(
  (select comment from public.audit_log
   where action = 'allowance_removed' and subject_id = :'mgr'),
  null,
  'an empty reason after a non-empty one in the same transaction does not inherit it');

select * from finish();
rollback;
