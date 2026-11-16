-- Access matrix row 35: a `user_*` entry about another person is admin-only, even for
-- a manager. Managers decide requests and allowances, not people, so the entity filter
-- in the policy keeps them out (FR-020). The subject of the entry sees their own.
begin;
select plan(9);

select tests.create_user('employee', 'QLD') as emp1 \gset
select tests.create_user('employee', 'NSW') as emp2 \gset
select tests.create_user('manager', 'QLD') as mgr \gset
select tests.create_user('admin', 'HK') as adm \gset

-- The admin promotes emp2 and moves them region in one save: two entries, both about
-- another person, neither of them a request or an allowance.
select tests.as_authenticated(:'adm');
select public.admin_update_user(:'emp2', 'Test employee', 'manager', 'QLD');

-- emp1 edits their own region directly (the column grant on profiles allows it).
select tests.as_authenticated(:'emp1');
update public.profiles set region_code = 'HK' where id = (select auth.uid());
select tests.reset_role();

select id from public.audit_log
  where action = 'user_role_changed' and subject_id = :'emp2' \gset role_
select id from public.audit_log
  where action = 'user_region_changed' and subject_id = :'emp2' \gset reg_
select id from public.audit_log
  where action = 'user_region_changed' and subject_id = :'emp1' \gset own_

select is(
  (select count(*)::int from public.audit_log
   where id in (:'role_id', :'reg_id', :'own_id')),
  3,
  'one save of role and region wrote two entries, and the self-edit wrote one'
);

select tests.as_authenticated(:'emp1');
select is((select count(*)::int from public.audit_log where id = :'role_id'), 0,
  'employee does not see another person''s role change');
select is((select count(*)::int from public.audit_log where id = :'reg_id'), 0,
  'employee does not see another person''s region change');
select is((select count(*)::int from public.audit_log where id = :'own_id'), 1,
  'employee sees the entry their own edit wrote');
select tests.reset_role();

select tests.as_authenticated(:'mgr');
select is((select count(*)::int from public.audit_log where id = :'role_id'), 0,
  'manager does not see another person''s role change');
select is((select count(*)::int from public.audit_log where id = :'reg_id'), 0,
  'manager sees no person entry about anyone else, at any role');
select tests.reset_role();

-- emp2 is now a manager, so their own entries are still theirs to read.
select tests.as_authenticated(:'emp2');
select is((select count(*)::int from public.audit_log where id = :'role_id'), 1,
  'the subject sees the role change made about them');
select is((select count(*)::int from public.audit_log where id = :'reg_id'), 1,
  'the subject sees the region change made about them');
select tests.reset_role();

select tests.as_authenticated(:'adm');
select is((select count(*)::int from public.audit_log
   where id in (:'role_id', :'reg_id', :'own_id')), 3,
  'admin sees every person entry');
select tests.reset_role();

select * from finish();
rollback;
