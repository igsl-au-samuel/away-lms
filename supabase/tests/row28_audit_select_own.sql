-- Access matrix row 28: an entry where the caller is the actor or the subject is
-- visible to that caller (E, M, A) and to nobody else. An inactive user gets no rows
-- and anon has no select grant at all. Every entry here is made by a real event, so
-- the file also proves the matching trigger wrote it.
--
-- Entry ids are captured while the session is still the owner: a test has to name the
-- entry it is checking, and the caller it later impersonates may be refused it.
begin;
select plan(10);

select tests.create_user('employee', 'QLD') as emp \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'QLD') as adm \gset
select tests.create_user('employee', 'QLD', false) as off \gset

insert into public.leave_types (name, is_capped, default_allowance)
values ('Row28 annual', true, 20) returning id as lt \gset

-- The employee and the manager each submit their own request: actor and subject match.
select tests.as_authenticated(:'emp');
select public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08');
select tests.as_authenticated(:'mgr');
select public.submit_leave_request(:'lt', '2026-09-07', '2026-09-08');
select tests.reset_role();

-- The admin acts on the employee's behalf: actor is the admin, subject the employee.
select tests.as_authenticated(:'adm');
select public.admin_set_allowance(:'emp', :'lt', 2026::smallint, 25, 'Long service');
select tests.reset_role();

select id from public.audit_log
  where action = 'request_submitted' and subject_id = :'emp' \gset e1_
select id from public.audit_log
  where action = 'request_submitted' and subject_id = :'mgr' \gset e2_
select id from public.audit_log
  where action = 'allowance_set' and subject_id = :'emp' \gset e3_
-- tests.create_user inserts a profile, so the inactive user's own entry was written
-- with no caller behind it.
select id from public.audit_log
  where action = 'user_created' and subject_id = :'off' \gset e4_

select is(
  (select count(*)::int from public.audit_log
   where id in (:'e1_id', :'e2_id', :'e3_id', :'e4_id')),
  4,
  'the four events each wrote one entry'
);

select tests.as_authenticated(:'emp');
select is((select count(*)::int from public.audit_log where id = :'e1_id'), 1,
  'employee sees the entry their own action wrote');
select is((select count(*)::int from public.audit_log where id = :'e3_id'), 1,
  'employee sees an entry about them that someone else wrote');
select is((select count(*)::int from public.audit_log where id = :'e2_id'), 0,
  'employee does not see the manager''s own entry');
select is((select count(*)::int from public.audit_log where id = :'e4_id'), 0,
  'employee does not see an entry about another person');
select tests.reset_role();

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.audit_log where id = :'e2_id'), 1,
  'manager sees the entry their own action wrote');
select is((select count(*)::int from public.audit_log where id = :'e4_id'), 0,
  'manager does not see a user entry about another person');
select tests.reset_role();

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.audit_log
   where id in (:'e1_id', :'e2_id', :'e3_id', :'e4_id')), 4,
  'admin sees every one of them');
select tests.reset_role();

select tests.as_authenticated(:'off');
select is((select count(*)::int from public.audit_log), 0,
  'an inactive user sees no entries at all');
select tests.as_anon();
select throws_ok($t$ select count(*) from public.audit_log $t$, '42501', null,
  'anon has no select grant');

select * from finish();
rollback;
