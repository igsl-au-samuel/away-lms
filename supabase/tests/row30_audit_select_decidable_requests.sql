-- Access matrix row 30: a manager sees the request_* entries for anyone whose request
-- they could decide, which is an employee or an admin (ADR 0010, decide_leave_request).
-- An employee sees only their own; the admin sees everything.
begin;
select plan(9);

select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('manager', 'NSW') as mgr2 \gset
select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('admin', 'HK') as adm \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row30 annual', true, 20) returning id as lt \gset

-- An employee's request, approved by the manager.
select tests.as_authenticated(:'emp');
select id from public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08') \gset r1_
select tests.as_authenticated(:'mgr');
select public.decide_leave_request(:'r1_id', 'approved', 'Enjoy');

-- The admin's own request, declined by the other manager.
select tests.as_authenticated(:'adm');
select id from public.submit_leave_request(:'lt', '2026-09-14', '2026-09-15') \gset r2_
select tests.as_authenticated(:'mgr2');
select public.decide_leave_request(:'r2_id', 'declined', 'Peak season');
select tests.reset_role();

select id from public.audit_log
  where action = 'request_submitted' and entity_id = :'r1_id' \gset s1_
select id from public.audit_log
  where action = 'request_approved' and entity_id = :'r1_id' \gset d1_
select id from public.audit_log
  where action = 'request_submitted' and entity_id = :'r2_id' \gset s2_
select id from public.audit_log
  where action = 'request_declined' and entity_id = :'r2_id' \gset d2_

select is(
  (select count(*)::int from public.audit_log
   where entity_id in (:'r1_id', :'r2_id')),
  4,
  'each request has one submission and one decision entry'
);

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.audit_log where id = :'s1_id'), 1,
  'manager sees an employee''s submission');
select is((select count(*)::int from public.audit_log where id = :'d1_id'), 1,
  'manager sees the decision they made');
select is((select count(*)::int from public.audit_log where id = :'s2_id'), 1,
  'manager sees the admin''s submission, whose request they could decide');
select is((select count(*)::int from public.audit_log where id = :'d2_id'), 1,
  'manager sees a decision another manager made about the admin');
select tests.reset_role();

select tests.as_authenticated(:'emp');
select is((select count(*)::int from public.audit_log where id = :'s2_id'), 0,
  'employee does not see the admin''s submission');
select is((select count(*)::int from public.audit_log where id = :'d2_id'), 0,
  'employee does not see a decision about the admin');
select is((select count(*)::int from public.audit_log where id = :'d1_id'), 1,
  'employee does see the decision made on their own request');
select tests.reset_role();

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.audit_log
   where id in (:'s1_id', :'d1_id', :'s2_id', :'d2_id')), 4,
  'admin sees all four entries');
select tests.reset_role();

select * from finish();
rollback;
