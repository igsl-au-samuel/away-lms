-- Access matrix row 34: `leave_type_changed` (name, active flag, sort order) is an
-- admin-only entry. It changes no balance, so no other role needs it (FR-021).
begin;
select plan(7);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row34 annual', true, 20) returning id as lt \gset

update public.leave_types
set name = 'Row34 annual leave', sort_order = 3
where id = :'lt';

select id from public.audit_log
  where action = 'leave_type_changed' and entity_id = :'lt' \gset e_

select is((select count(*)::int from public.audit_log where id = :'e_id'), 1,
  'the rename wrote one leave_type_changed entry');
select is(
  (select count(*)::int from public.audit_log
   where action = 'leave_type_default_changed' and entity_id = :'lt'),
  0,
  'the same save wrote no default-change entry');

select tests.as_authenticated(:'emp');
select is((select count(*)::int from public.audit_log where id = :'e_id'), 0,
  'employee does not see a leave type rename');
select tests.reset_role();

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.audit_log where id = :'e_id'), 0,
  'manager does not see a leave type rename');
select tests.reset_role();

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.audit_log where id = :'e_id'), 1,
  'admin sees the leave type rename');
select tests.reset_role();

select tests.as_authenticated(:'off');
select is((select count(*)::int from public.audit_log), 0,
  'an inactive user sees no entries at all');

select tests.as_anon();
select throws_ok($t$ select count(*) from public.audit_log $t$, '42501', null,
  'anon has no select grant');

select * from finish();
rollback;
