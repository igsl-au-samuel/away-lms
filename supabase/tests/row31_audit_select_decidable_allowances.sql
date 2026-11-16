-- Access matrix row 31: a manager sees the allowance_* entries for a person whose
-- allowance they could decide for, meaning an employee or an admin (the Approvals
-- page shows these for the queue requesters). An employee sees only their own.
begin;
select plan(7);

select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('employee', 'QLD') as emp2 \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('admin', 'NSW') as adm2 \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row31 annual', true, 20) returning id as lt \gset

select tests.as_authenticated(:'adm');
select public.admin_set_allowance(:'emp', :'lt', 2026::smallint, 25, 'Long service');
select public.admin_set_allowance(:'emp', :'lt', 2026::smallint, null, 'Back to default');
select public.admin_set_allowance(:'adm2', :'lt', 2026::smallint, 18, 'Contract change');
select tests.reset_role();

select id from public.audit_log
  where action = 'allowance_set' and subject_id = :'emp' \gset set_
select id from public.audit_log
  where action = 'allowance_removed' and subject_id = :'emp' \gset rem_
select id from public.audit_log
  where action = 'allowance_set' and subject_id = :'adm2' \gset adm_

select is(
  (select count(*)::int from public.audit_log
   where id in (:'set_id', :'rem_id', :'adm_id')),
  3,
  'the three allowance events each wrote one entry'
);

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.audit_log where id = :'set_id'), 1,
  'manager sees an employee''s allowance being set');
select is((select count(*)::int from public.audit_log where id = :'rem_id'), 1,
  'manager sees an employee''s allowance being removed');
select is((select count(*)::int from public.audit_log where id = :'adm_id'), 1,
  'manager sees an admin''s allowance change, whose requests they could decide');
select tests.reset_role();

select tests.as_authenticated(:'emp2');
select is((select count(*)::int from public.audit_log where id = :'set_id'), 0,
  'an employee does not see another employee''s allowance change');
select tests.reset_role();

select tests.as_authenticated(:'emp');
select is((select count(*)::int from public.audit_log where id = :'set_id'), 1,
  'the employee still sees their own allowance change');
select tests.reset_role();

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.audit_log
   where id in (:'set_id', :'rem_id', :'adm_id')), 3,
  'admin sees all three entries');
select tests.reset_role();

select * from finish();
rollback;
