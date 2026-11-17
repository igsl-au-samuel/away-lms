-- FR-031 and SC-001: the leave-type events. One save can be a default change (which
-- everyone is affected by and can read), a bookkeeping change (admins only), both, or
-- neither. The legacy private.log_leave_type_default() trigger wrote the same event to
-- allowance_changes through slice 1's double-write; A039 dropped it, so the audit entry is
-- the only record and the assertions below say so.
begin;
select plan(14);

select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD') as emp \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('A23 annual', true, 20), ('A23 carer', false, null);

select id from public.leave_types where name = 'A23 annual' \gset annual_
select id from public.leave_types where name = 'A23 carer' \gset carer_

-- ---- the default moves ----
select tests.as_authenticated(:'adm');
update public.leave_types set default_allowance = 22.0 where id = :'annual_id';
select tests.reset_role();

select is(
  (select count(*)::int from public.audit_log where entity_id = :'annual_id'),
  1,
  'moving the default writes exactly one entry');
select is(
  (select action from public.audit_log where entity_id = :'annual_id'),
  'leave_type_default_changed',
  'the action names the default change');
select is(
  (select (before->>'default_allowance') || '>' || (after->>'default_allowance')
   || '/' || (before->>'is_capped') || '>' || (after->>'is_capped')
   from public.audit_log where entity_id = :'annual_id'),
  '20.0>22.0/true>true',
  'the entry holds both halves of the capped pair');
select is(
  (select (subject_id is null)::text || '/' || entity || '/'
   || (entity_id = :'annual_id')::text
   from public.audit_log where entity_id = :'annual_id'),
  'true/leave_type/true',
  'a default belongs to the type, not to a person');
select is(
  (select actor_role::text || '/' || actor_name || '/' || (context->>'leave_type_name')
   from public.audit_log where entity_id = :'annual_id'),
  'admin/Test admin/A23 annual',
  'the admin and the type name at the time are recorded');

-- The legacy logger had two halves and A046 removed the second one by dropping its table. What is
-- left to assert is the function: a name that does not resolve cannot be reached by any route.
select is(
  (select coalesce(to_regprocedure('private.log_leave_type_default()')::text, '<gone>')),
  '<gone>',
  'A039 dropped the function too, so nothing can log a default change as "everyone" again');

-- ---- the name moves ----
select tests.as_authenticated(:'adm');
update public.leave_types set name = 'A23 annual leave' where id = :'annual_id';
select tests.reset_role();

select is(
  (select count(*)::int from public.audit_log
   where entity_id = :'annual_id' and action = 'leave_type_changed'),
  1,
  'the rename wrote one leave_type_changed entry');
select is(
  (select (before->>'name') || '>' || (after->>'name')
   from public.audit_log
   where entity_id = :'annual_id' and action = 'leave_type_changed'),
  'A23 annual>A23 annual leave',
  'the rename entry holds the old name and the new one');
select is(
  (select count(*)::int from public.audit_log
   where entity_id = :'annual_id' and action = 'leave_type_default_changed'),
  1,
  'the rename wrote no second default entry');
select is(
  (select (context->>'leave_type_name') from public.audit_log
   where entity_id = :'annual_id' and action = 'leave_type_default_changed'),
  'A23 annual',
  'the earlier entry keeps the name the type had at the time (FR-012)');

-- ---- two bookkeeping fields in one save, name untouched ----
select tests.as_authenticated(:'adm');
update public.leave_types set is_active = false, sort_order = 5 where id = :'carer_id';
select tests.reset_role();

select is(
  (select (after ? 'name')::text || '/' || (before->>'is_active') || '>' || (after->>'is_active')
   || '/' || (before->>'sort_order') || '>' || (after->>'sort_order')
   from public.audit_log where entity_id = :'carer_id' and action = 'leave_type_changed'),
  'false/true>false/0>5',
  'only the fields that moved appear in the payload');

-- ---- one save that is both kinds at once ----
select tests.as_authenticated(:'adm');
update public.leave_types
set default_allowance = 18.0, name = 'A23 annual v2'
where id = :'annual_id';
select tests.reset_role();

select is(
  (select string_agg(action, ',' order by action) from public.audit_log
   where entity_id = :'annual_id'
     and ((after->>'name') = 'A23 annual v2' or (after->>'default_allowance') = '18.0')),
  'leave_type_changed,leave_type_default_changed',
  'a save that changes the default and the name writes one of each');

-- ---- a save that changes neither ----
select tests.as_authenticated(:'adm');
update public.leave_types set name = 'A23 carer' where id = :'carer_id';
select tests.reset_role();

select is(
  (select count(*)::int from public.audit_log where entity_id = :'carer_id'),
  1,
  'saving the same values writes nothing');

-- ---- and a migration-style change with no caller ----
update public.leave_types set is_capped = true, default_allowance = 21.0
where id = :'carer_id';
select is(
  (select actor_name from public.audit_log
   where entity_id = :'carer_id' and action = 'leave_type_default_changed'),
  'System',
  'a change with no signed-in admin still leaves an entry, as System');

select * from finish();
rollback;
