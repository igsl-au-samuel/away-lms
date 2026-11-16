-- Access matrix row 29: an employee or a manager cannot see another person's entry
-- when it is not a default change and not something they can decide. The employee's
-- own count over the other person's rows is 0, not a filtered subset (FR-022), and
-- the admin sees them all.
begin;
select plan(9);

select tests.create_user('employee', 'QLD') as emp1 \gset
select tests.create_user('employee', 'QLD') as emp2 \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row29 annual', true, 20) returning id as lt \gset

select tests.as_authenticated(:'emp1');
select public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08');
select tests.as_authenticated(:'emp2');
select public.submit_leave_request(:'lt', '2026-09-14', '2026-09-15');
select tests.as_authenticated(:'adm');
select public.admin_set_allowance(:'emp2', :'lt', 2026::smallint, 25, 'Long service');
select public.admin_set_active(:'emp2', false);
select tests.reset_role();

select id from public.audit_log
  where action = 'request_submitted' and subject_id = :'emp1' \gset own_
select id from public.audit_log
  where action = 'request_submitted' and subject_id = :'emp2' \gset req_
select id from public.audit_log
  where action = 'allowance_set' and subject_id = :'emp2' \gset all_
select id from public.audit_log
  where action = 'user_active_changed' and subject_id = :'emp2' \gset usr_

-- user_created plus the three events above.
select is(
  (select count(*)::int from public.audit_log where subject_id = :'emp2'),
  4,
  'four entries were written about the other employee'
);

select tests.as_authenticated(:'emp1');
select is(
  (select count(*)::int from public.audit_log where subject_id = :'emp2'),
  0,
  'an employee counts zero of another person''s entries, not a filtered subset'
);
select is((select count(*)::int from public.audit_log where id = :'req_id'), 0,
  'employee does not see another person''s submission');
select is((select count(*)::int from public.audit_log where id = :'all_id'), 0,
  'employee does not see another person''s allowance change');
select is((select count(*)::int from public.audit_log where id = :'usr_id'), 0,
  'employee does not see another person''s activation change');
select is((select count(*)::int from public.audit_log where id = :'own_id'), 1,
  'the employee still sees their own entry');
select tests.reset_role();

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.audit_log where id = :'usr_id'), 0,
  'manager does not see a user entry about another person');
select tests.reset_role();

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.audit_log
   where id in (:'req_id', :'all_id', :'usr_id')), 3,
  'admin sees all three of the other person''s entries');
select tests.reset_role();

select tests.as_anon();
select throws_ok($t$ select count(*) from public.audit_log $t$, '42501', null,
  'anon has no select grant');

select * from finish();
rollback;
