-- Access matrix row 32: a manager does not see another manager's request or allowance
-- entries, and neither does an employee. The admin does. Row 28 still holds on top of
-- this: a manager always sees the entries their own actions wrote, because they are
-- the actor, even when the entry is about a colleague.
begin;
select plan(9);

select tests.create_user('manager', 'QLD') as mgr1 \gset
select tests.create_user('manager', 'NSW') as mgr2 \gset
select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('admin', 'HK') as adm \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row32 annual', true, 20) returning id as lt \gset

-- mgr2 has a request, approved by the admin (only an admin may decide a manager),
-- and an allowance override set by the admin.
select tests.as_authenticated(:'mgr2');
select id from public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08') \gset r2_
select tests.as_authenticated(:'adm');
select public.decide_leave_request(:'r2_id', 'approved', 'Go');
select public.admin_set_allowance(:'mgr2', :'lt', 2026::smallint, 24, 'Covering leave');

-- mgr1 approves an employee's request: mgr1 is the actor on that entry.
select tests.as_authenticated(:'emp');
select id from public.submit_leave_request(:'lt', '2026-09-14', '2026-09-15') \gset r1_
select tests.as_authenticated(:'mgr1');
select public.decide_leave_request(:'r1_id', 'approved', 'Fine');
select tests.reset_role();

select id from public.audit_log
  where action = 'request_submitted' and entity_id = :'r2_id' \gset s2_
select id from public.audit_log
  where action = 'request_approved' and entity_id = :'r2_id' \gset d2_
select id from public.audit_log
  where action = 'allowance_set' and subject_id = :'mgr2' \gset a2_
select id from public.audit_log
  where action = 'request_approved' and entity_id = :'r1_id' \gset d1_

select is(
  (select count(*)::int from public.audit_log
   where id in (:'s2_id', :'d2_id', :'a2_id', :'d1_id')),
  4,
  'the four events each wrote one entry'
);

select tests.as_authenticated(:'mgr1');
select is((select count(*)::int from public.audit_log where id = :'s2_id'), 0,
  'manager does not see another manager''s submission');
select is((select count(*)::int from public.audit_log where id = :'d2_id'), 0,
  'manager does not see a decision another person made about a manager');
select is((select count(*)::int from public.audit_log where id = :'a2_id'), 0,
  'manager does not see another manager''s allowance change');
select tests.reset_role();

select tests.as_authenticated(:'emp');
select is((select count(*)::int from public.audit_log where id = :'s2_id'), 0,
  'employee does not see a manager''s submission');
select is((select count(*)::int from public.audit_log where id = :'a2_id'), 0,
  'employee does not see a manager''s allowance change');
select tests.reset_role();

select tests.as_authenticated(:'mgr2');
select is((select count(*)::int from public.audit_log where id = :'d2_id'), 1,
  'the manager whose request was decided sees that entry as its subject');
select tests.reset_role();

select tests.as_authenticated(:'mgr1');
select is((select count(*)::int from public.audit_log where id = :'d1_id'), 1,
  'a manager sees the decision they made, because they are the actor (row 28)');
select tests.reset_role();

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.audit_log
   where id in (:'s2_id', :'d2_id', :'a2_id', :'d1_id')), 4,
  'admin sees all four entries');
select tests.reset_role();

select * from finish();
rollback;
